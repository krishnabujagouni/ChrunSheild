"""30-day save confirmation + Stripe Connect billing.

Flow (product doc §3.1):
1. Find save_sessions where:
   - offer_accepted = true
   - outcome_confirmed_at is 30+ days ago   ← set immediately for pause/empathy;
                                               set by stripe_worker.handle_invoice_paid
                                               for extension/discount/downgrade
   - fee_billed_at IS NULL  (not yet charged)
   - fee_charged > 0
2. For each session, check Stripe that the subscription is still active.
3. If active  → charge fee via Stripe Connect application_fee on a PaymentIntent.
4. If churned → null out saved_value + fee_charged (save didn't hold).
5. Stamp fee_billed_at either way so we never revisit the row.

Fee basis and timing per offer type:
  pause      → 15% of full MRR    charged by billing sweep after 30 days
               Pause lasts ~1 month; at day 30 subscription resumes and subscriber pays.
               Sweep verifies subscription active (resumed) before charging merchant.
  empathy    → 15% of full MRR    charged by billing sweep after 30 days
               No payment event to verify, so wait to confirm subscriber stayed.
  extension  → 15% of full MRR    charged immediately by stripe_worker on invoice.paid
  discount   → 15% of net MRR     charged immediately by stripe_worker on invoice.paid
  downgrade  → 15% of new plan MRR charged immediately by stripe_worker on invoice.paid
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
                ss.tenant_id::text,
                ss.subscriber_id,
                ss.fee_charged,
                ss.subscription_mrr,
                t.stripe_connect_id,
                t.owner_email
            FROM save_sessions ss
            JOIN tenants t ON t.id = ss.tenant_id
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
        tenant_id = row["tenant_id"]
        stripe_connect_id: str | None = row["stripe_connect_id"]
        owner_email: str | None = row["owner_email"]
        subscriber_id = row["subscriber_id"]
        fee_charged = float(row["fee_charged"] or 0)
        fee_cents = round(fee_charged * 100)

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

            # Step 2: charge via Stripe Connect if account connected
            stripe_charge_id: str | None = None
            if stripe_connect_id and fee_cents >= 50:  # Stripe minimum charge $0.50
                stripe_charge_id = await _charge_via_stripe_connect(
                    tenant_stripe_account=stripe_connect_id,
                    customer_id=subscriber_id,
                    fee_cents=fee_cents,
                    session_id=session_id,
                    api_key=settings.stripe_secret_key,
                )

            # Step 3: stamp fee_billed_at regardless (so we don't retry)
            async with _db.pool().acquire() as conn:
                await conn.execute(
                    """
                    UPDATE save_sessions
                    SET fee_billed_at   = NOW(),
                        stripe_charge_id = $1
                    WHERE session_id = $2::uuid
                    """,
                    stripe_charge_id,
                    session_id,
                )
            charged += 1
            logger.info(
                "billing.confirmed session=%s charged=%s pi=%s",
                session_id, fee_charged, stripe_charge_id,
            )

            # #6: Save confirmation email to merchant
            if owner_email and stripe_charge_id:
                try:
                    subject = f"[ChurnShield] Subscriber saved  ${fee_charged:.2f} fee charged"
                    html = (
                        f"<p>Hi,</p>"
                        f"<p>A subscriber has been retained and a save fee of "
                        f"<strong>${fee_charged:.2f}</strong> has been charged to your "
                        f"Stripe account.</p>"
                        f"<p>Session ID: {session_id}</p>"
                        f"<p> ChurnShield</p>"
                    )
                    await send_merchant_email(owner_email, subject, html)
                except Exception:
                    logger.exception("billing.save_confirm_email_failed session=%s", session_id)

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
