"""30-day re-check for pause/empathy (and legacy untyped) saves.

1. Select accepted saves with outcome_confirmed_at set 30+ days ago, fee_billed_at null,
   fee_charged > 0, offer_type in pause/empathy (or null).
2. If the Stripe subscription is no longer active → clear saved_value/fee_charged and set
   fee_billed_at so the row is closed (no tenant charge).
3. If still active → no-op on fee fields; monthly Vercel cron is the only Stripe charge path.

Deferred offer types get outcome + fee from stripe_worker on invoice.paid; this job does not
charge Connect accounts (_charge_via_stripe_connect is unused).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe

from churnshield_agents import db as _db
from churnshield_agents.agents.merchant_email import send_merchant_email
from churnshield_agents.config import get_settings

logger = logging.getLogger(__name__)

FEE_RATE = 0.15  # 15% of saved MRR  must match apps/web cancel-outcome route


async def _check_subscription_active(
    customer_id: str,
    api_key: str,
) -> bool:
    """Return True if the Stripe customer has at least one active subscription."""
    try:
        subs = await asyncio.to_thread(
            stripe.Subscription.list,
            customer=customer_id,
            status="active",
            limit=1,
            api_key=api_key,
        )
        return len(subs.data) > 0
    except Exception:
        logger.exception("billing.check_sub_failed customer=%s", customer_id)
        return False  # Fail safe  don't charge if we can't verify


async def _charge_via_stripe_connect(
    tenant_stripe_account: str,
    customer_id: str,
    fee_cents: int,
    session_id: str,
    api_key: str,
) -> str | None:
    """
    Create a Stripe PaymentIntent on the tenant's connected account with
    application_fee_amount so ChurnShield's platform account gets the fee.

    Returns the PaymentIntent ID on success, None on failure.

    Note: In production this requires the customer to have a default payment method
    on the connected account. For MVP we create the charge directly.
    """
    try:
        pi = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=fee_cents,
            currency="usd",
            customer=customer_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            description=f"ChurnShield save fee  session {session_id}",
            metadata={"churnshield_session_id": session_id},
            stripe_account=tenant_stripe_account,
            api_key=api_key,
        )
        logger.info(
            "billing.charged session=%s pi=%s amount_cents=%d",
            session_id, pi.id, fee_cents,
        )
        return pi.id
    except stripe.error.StripeError as e:
        logger.warning("billing.charge_failed session=%s err=%s", session_id, e)
        return None


async def run_billing_sweep() -> dict[str, Any]:
    """
    Main entry: find sessions due for 30-day confirmation and process them.
    Called by APScheduler daily cron.
    """
    settings = get_settings()
    if not settings.stripe_secret_key:
        return {"skipped": True, "reason": "stripe_not_configured"}

    # asyncpg returns naive UTC datetimes  use naive cutoff to match
    cutoff = datetime.utcnow() - timedelta(days=30)

    async with _db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                ss.session_id::text,
                ss.subscriber_id,
                ss.fee_charged
            FROM save_sessions ss
            WHERE ss.offer_accepted = true
              AND ss.outcome_confirmed_at IS NOT NULL
              AND ss.fee_billed_at IS NULL
              AND ss.fee_charged > 0
              AND (
                -- Pause + empathy: wait 30 days
                -- Pause: subscription resumes ~day 30, sweep verifies active then charges
                -- Empathy: no payment event, wait to confirm subscriber actually stayed
                (ss.offer_type IN ('pause', 'empathy') AND ss.outcome_confirmed_at <= $1)
                OR
                -- Legacy / untyped sessions: 30-day wait as safe default
                (ss.offer_type IS NULL AND ss.outcome_confirmed_at <= $1)
              )
            ORDER BY ss.outcome_confirmed_at
            LIMIT 100
            """,
            cutoff,
        )

    logger.info("billing.sweep due=%d", len(rows))
    charged = cancelled = errors = 0

    for row in rows:
        session_id = row["session_id"]
        subscriber_id = row["subscriber_id"]
        fee_charged = float(row["fee_charged"] or 0)

        try:
            # Step 1: verify subscription still active
            still_active = await _check_subscription_active(
                customer_id=subscriber_id,
                api_key=settings.stripe_secret_key,
            )

            if not still_active:
                # Save didn't hold  null out the fee
                async with _db.pool().acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE save_sessions
                        SET saved_value = NULL,
                            fee_charged  = NULL,
                            fee_billed_at = NOW()
                        WHERE session_id = $1::uuid
                        """,
                        session_id,
                    )
                logger.info("billing.save_not_held session=%s subscriber=%s", session_id, subscriber_id)
                cancelled += 1
                continue

            # Step 2: mark confirmed so monthly cron picks it up for billing
            # No Stripe charge here  all charging done by 1st-of-month cron (one invoice per tenant)
            async with _db.pool().acquire() as conn:
                await conn.execute(
                    """
                    UPDATE save_sessions
                    SET outcome_confirmed_at = NOW()
                    WHERE session_id = $1::uuid
                      AND outcome_confirmed_at IS NULL
                    """,
                    session_id,
                )
            charged += 1
            logger.info(
                "billing.sweep_ok session=%s fee=%.2f — monthly cron bills; no per-row email",
                session_id, fee_charged,
            )

        except Exception:
            logger.exception("billing.row_failed session=%s", session_id)
            errors += 1

    return {
        "due": len(rows),
        "charged": charged,
        "save_not_held": cancelled,
        "errors": errors,
    }


async def run_monthly_billing_summary() -> dict[str, Any]:
    """
    #5: Monthly billing summary email  aggregate fees billed in the past 30 days,
    email each merchant a summary. Called by monthly APScheduler cron (1st of month).
    """
    async with _db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                ss.tenant_id::text,
                t.owner_email,
                COUNT(*)                    AS sessions,
                SUM(ss.fee_charged)         AS total_fees,
                SUM(ss.subscription_mrr)    AS total_mrr_saved
            FROM save_sessions ss
            JOIN tenants t ON t.id = ss.tenant_id
            WHERE ss.fee_billed_at >= NOW() - INTERVAL '30 days'
              AND ss.fee_charged > 0
              AND t.owner_email IS NOT NULL
            GROUP BY ss.tenant_id, t.owner_email
            """,
        )

    sent = 0
    for row in rows:
        owner_email = row["owner_email"]
        sessions = int(row["sessions"])
        total_fees = float(row["total_fees"] or 0)
        total_mrr = float(row["total_mrr_saved"] or 0)
        plural = "s" if sessions != 1 else ""

        subject = f"[ChurnShield] Monthly summary  ${total_fees:.2f} in save fees"
        html = (
            f"<p>Hi,</p>"
            f"<p>Here's your ChurnShield summary for the last 30 days:</p>"
            f"<ul>"
            f"<li><strong>{sessions}</strong> subscriber{plural} saved</li>"
            f"<li><strong>${total_mrr:.2f}</strong> MRR retained</li>"
            f"<li><strong>${total_fees:.2f}</strong> in ChurnShield save fees charged</li>"
            f"</ul>"
            f"<p> ChurnShield</p>"
        )
        try:
            await send_merchant_email(owner_email, subject, html)
            sent += 1
            logger.info("billing.monthly_summary_sent tenant=%s fees=%.2f", row["tenant_id"], total_fees)
        except Exception:
            logger.exception("billing.monthly_summary_failed tenant=%s", row["tenant_id"])

    return {"tenants_emailed": sent, "total_rows": len(rows)}
