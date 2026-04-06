"""APScheduler cron jobs: daily churn prediction, weekly feedback digest, hourly retry sweep."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import stripe
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from churnshield_agents import db as _db
from churnshield_agents.agents import billing, churn_prediction, feedback_analyser, payment_recovery
from churnshield_agents.agents.billing import run_monthly_billing_summary
from churnshield_agents.agents.payment_recovery import run_payment_recovery_summary
from churnshield_agents.config import get_settings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_churn_prediction_all() -> None:
    try:
        tenant_ids = await _db.get_all_tenant_ids()
    except Exception:
        logger.exception("cron.churn: failed to fetch tenants")
        return
    for tid in tenant_ids:
        try:
            result = await churn_prediction.run_churn_prediction(str(tid))
            logger.info("cron.churn done tenant=%s high_risk=%d", tid, result["high_risk_count"])
        except Exception:
            logger.exception("cron.churn failed tenant=%s", tid)


async def _run_feedback_analysis_all() -> None:
    try:
        tenant_ids = await _db.get_all_tenant_ids()
    except Exception:
        logger.exception("cron.feedback: failed to fetch tenants")
        return
    for tid in tenant_ids:
        try:
            result = await feedback_analyser.run_feedback_analysis(str(tid))
            logger.info("cron.feedback done tenant=%s themes=%d", tid, result["themes"])
        except Exception:
            logger.exception("cron.feedback failed tenant=%s", tid)


async def _sweep_payment_retries() -> None:
    """Atomically claim due retries, send emails, advance or exhaust each record."""
    try:
        async with _db.pool().acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    """
                    UPDATE payment_retries
                    SET status = 'processing', updated_at = NOW()
                    WHERE id IN (
                        SELECT id FROM payment_retries
                        WHERE status = 'pending'
                          AND next_retry_at <= NOW()
                          AND attempts < max_attempts
                        ORDER BY next_retry_at
                        LIMIT 50
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING
                        id, tenant_id::text,
                        invoice_id, customer_id, customer_email, failure_class,
                        delay_hours, attempts, max_attempts,
                        created_at
                    """,
                )
    except Exception:
        logger.exception("retry.sweep: query failed")
        return

    settings = get_settings()

    for row in rows:
        new_attempts = row["attempts"] + 1
        try:
            # Actually retry the Stripe invoice payment
            invoice_id = row["invoice_id"]
            stripe_error: str | None = None
            if invoice_id and settings.stripe_secret_key:
                try:
                    await asyncio.to_thread(
                        stripe.Invoice.pay,
                        invoice_id,
                        api_key=settings.stripe_secret_key,
                    )
                    logger.info("retry.stripe_pay success invoice=%s", invoice_id)
                except stripe.error.CardError as e:
                    stripe_error = str(e)
                    logger.warning("retry.stripe_pay card_error invoice=%s err=%s", invoice_id, stripe_error)
                except Exception as e:
                    stripe_error = str(e)
                    logger.warning("retry.stripe_pay failed invoice=%s err=%s", invoice_id, stripe_error)

            # Send recovery email regardless of stripe retry outcome
            await payment_recovery.send_recovery_email({
                "invoice_id":     row["invoice_id"],
                "customer_id":    row["customer_id"],
                "customer_email": row["customer_email"],
                "failure_class":  row["failure_class"],
            })

            if new_attempts >= row["max_attempts"]:
                new_status = "exhausted"
                next_retry_at = None
                # Set payment wall  subscriber has exhausted all retry attempts
                if row["tenant_id"] and row["customer_id"]:
                    import uuid as _uuid
                    async with _db.pool().acquire() as conn:
                        await conn.execute(
                            """
                            INSERT INTO subscriber_flags
                                (id, tenant_id, subscriber_id, payment_wall_active, updated_at)
                            VALUES ($1::uuid, $2::uuid, $3, true, NOW())
                            ON CONFLICT (tenant_id, subscriber_id) DO UPDATE SET
                                payment_wall_active = true,
                                updated_at = NOW()
                            """,
                            str(_uuid.uuid4()),
                            row["tenant_id"],
                            row["customer_id"],
                        )
                    logger.info("retry.payment_wall_set tenant=%s subscriber=%s", row["tenant_id"], row["customer_id"])
            else:
                new_status = "pending"
                delay_hours: list[int] = row["delay_hours"]
                next_retry_at = row["created_at"].replace(tzinfo=timezone.utc) + timedelta(
                    hours=delay_hours[new_attempts]
                )

            async with _db.pool().acquire() as conn:
                await conn.execute(
                    """
                    UPDATE payment_retries
                    SET attempts = $1, status = $2, next_retry_at = $3, last_error = $4, updated_at = NOW()
                    WHERE id = $5
                    """,
                    new_attempts,
                    new_status,
                    next_retry_at,
                    stripe_error,
                    row["id"],
                )
            logger.info("retry.done id=%s attempts=%d status=%s", row["id"], new_attempts, new_status)

        except Exception:
            logger.exception("retry.item_failed id=%s", row["id"])
            async with _db.pool().acquire() as conn:
                await conn.execute(
                    "UPDATE payment_retries SET status = 'pending', updated_at = NOW() WHERE id = $1",
                    row["id"],
                )


async def _run_billing_sweep() -> None:
    try:
        result = await billing.run_billing_sweep()
        logger.info("cron.billing done due=%d charged=%d cancelled=%d errors=%d",
                    result.get("due", 0), result.get("charged", 0),
                    result.get("save_not_held", 0), result.get("errors", 0))
    except Exception:
        logger.exception("cron.billing failed")


async def _run_monthly_billing_summary() -> None:
    try:
        result = await run_monthly_billing_summary()
        logger.info("cron.billing_summary done tenants_emailed=%d", result.get("tenants_emailed", 0))
    except Exception:
        logger.exception("cron.billing_summary failed")


async def _run_payment_recovery_summary() -> None:
    try:
        result = await run_payment_recovery_summary()
        logger.info("cron.recovery_summary done tenants_emailed=%d", result.get("tenants_emailed", 0))
    except Exception:
        logger.exception("cron.recovery_summary failed")


# After sleep/restart, interval jobs can be "late"; grace avoids executor WARNING + still runs once.
_SWEEP_MISFIRE_GRACE_S = 3600  # hourly job: allow up to 1h late
_JOB_DEFAULTS = {
    "coalesce": True,  # stacked misfires → single catch-up run
    "max_instances": 1,
}


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(_run_churn_prediction_all,      CronTrigger(hour=2, minute=0),                            id="churn_daily",      **_JOB_DEFAULTS, misfire_grace_time=_SWEEP_MISFIRE_GRACE_S)
    _scheduler.add_job(
        _run_feedback_analysis_all,
        CronTrigger(day_of_week="mon", hour=3, minute=0),
        id="feedback_weekly",
        **_JOB_DEFAULTS,
        misfire_grace_time=_SWEEP_MISFIRE_GRACE_S,
    )
    _scheduler.add_job(
        _sweep_payment_retries,
        IntervalTrigger(hours=1),
        id="retry_sweep",
        misfire_grace_time=_SWEEP_MISFIRE_GRACE_S,
        coalesce=True,
        max_instances=1,
    )
    _scheduler.add_job(_run_billing_sweep,             CronTrigger(hour=4, minute=0),                            id="billing_daily",     **_JOB_DEFAULTS, misfire_grace_time=_SWEEP_MISFIRE_GRACE_S)
    _scheduler.add_job(_run_monthly_billing_summary,      CronTrigger(day=1, hour=5, minute=0),                    id="billing_monthly_summary", **_JOB_DEFAULTS, misfire_grace_time=_SWEEP_MISFIRE_GRACE_S)
    _scheduler.add_job(_run_payment_recovery_summary,  CronTrigger(day_of_week="mon", hour=4, minute=30),        id="recovery_weekly_summary", **_JOB_DEFAULTS, misfire_grace_time=_SWEEP_MISFIRE_GRACE_S)
    _scheduler.start()
    logger.info("scheduler.started jobs=%d", len(_scheduler.get_jobs()))
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
