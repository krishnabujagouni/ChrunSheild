"""After webhook persistence: classify events and set `stripe_events.processed`."""

from __future__ import annotations

import asyncio
import json
import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

import stripe as _stripe

from churnshield_agents.agents import payment_recovery
from churnshield_agents.config import get_settings
from churnshield_agents.db import pool

logger = logging.getLogger(__name__)

FEE_RATE = Decimal("0.15")

# Offer types that wait for invoice.paid before confirming the save
DEFERRED_OFFER_TYPES = {"extension", "discount", "downgrade"}


def _as_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        return json.loads(payload)
    return dict(payload)


async def _charge_immediately(
    stripe_connect_id: str,
    customer_id: str,
    fee_cents: int,
    session_id: str,
    api_key: str,
) -> str | None:
    """Charge the merchant via Stripe Connect immediately. Returns PaymentIntent ID or None."""
    try:
        pi = await asyncio.to_thread(
            _stripe.PaymentIntent.create,
            amount=fee_cents,
            currency="usd",
            customer=customer_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            description=f"ChurnShield save fee (extension)  session {session_id}",
            metadata={"churnshield_session_id": session_id},
            stripe_account=stripe_connect_id,
            api_key=api_key,
        )
        logger.info("stripe_worker.extension_charged session=%s pi=%s cents=%d", session_id, pi.id, fee_cents)
        return pi.id
    except _stripe.error.StripeError as e:
        logger.warning("stripe_worker.extension_charge_failed session=%s err=%s", session_id, e)
        return None


async def handle_invoice_paid(payload: dict[str, Any], tenant_id: str | None) -> None:
    """
    Confirm deferred saves when a subscriber's invoice is paid.

    Charging behaviour by offer type:
      extension  → invoice.paid = save proven → charge fee IMMEDIATELY (no 30-day wait).
                   Subscriber paid full MRR after the free period  that IS the confirmation.
      discount   → set outcome_confirmed_at, let 30-day billing sweep verify they stayed.
      downgrade  → set outcome_confirmed_at, let 30-day billing sweep verify they stayed.
    """
    if not tenant_id:
        return

    invoice = payload.get("data", {}).get("object", {})
    customer_id: str | None = invoice.get("customer")
    amount_paid: int = int(invoice.get("amount_paid", 0))   # Stripe cents
    status: str = invoice.get("status", "")

    if not customer_id or status != "paid" or amount_paid <= 0:
        return

    invoice_mrr = Decimal(amount_paid) / Decimal(100)
    fee = (invoice_mrr * FEE_RATE).quantize(Decimal("0.01"))
    fee_cents = int(fee * 100)

    async with pool().acquire() as conn:
        # Find the most recent deferred save session + tenant stripe account
        row = await conn.fetchrow(
            """
            SELECT ss.session_id::text, ss.offer_type, t.stripe_connect_id
            FROM save_sessions ss
            JOIN tenants t ON t.id = ss.tenant_id
            WHERE ss.tenant_id     = $1::uuid
              AND ss.subscriber_id  = $2
              AND ss.offer_accepted = true
              AND ss.offer_type     = ANY($3::text[])
              AND ss.outcome_confirmed_at IS NULL
              AND ss.fee_billed_at  IS NULL
            ORDER BY ss.created_at DESC
            LIMIT 1
            """,
            tenant_id,
            customer_id,
            list(DEFERRED_OFFER_TYPES),
        )
        if not row:
            return

        session_id: str = row["session_id"]
        offer_type: str = row["offer_type"] or ""
        stripe_connect_id: str | None = row["stripe_connect_id"]

        # Stamp outcome confirmed + fee amounts for all deferred types
        await conn.execute(
            """
            UPDATE save_sessions
            SET outcome_confirmed_at = NOW(),
                saved_value          = $1,
                fee_charged          = $2
            WHERE session_id = $3::uuid
              AND outcome_confirmed_at IS NULL
            """,
            invoice_mrr,
            fee,
            session_id,
        )
        logger.info(
            "stripe_worker.deferred_confirmed session=%s offer=%s mrr=%.2f fee=%.2f",
            session_id, offer_type, invoice_mrr, fee,
        )

    # Extension / discount / downgrade: invoice.paid IS the proof of save  charge immediately.
    # No 30-day wait needed. The subscriber just paid real money; that confirms the save.
    if offer_type in DEFERRED_OFFER_TYPES and stripe_connect_id and fee_cents >= 50:
        settings = get_settings()
        stripe_charge_id = await _charge_immediately(
            stripe_connect_id=stripe_connect_id,
            customer_id=customer_id,
            fee_cents=fee_cents,
            session_id=session_id,
            api_key=settings.stripe_secret_key,
        )
        async with pool().acquire() as conn:
            await conn.execute(
                """
                UPDATE save_sessions
                SET fee_billed_at    = NOW(),
                    stripe_charge_id = $1
                WHERE session_id = $2::uuid
                """,
                stripe_charge_id,
                session_id,
            )
        logger.info(
            "stripe_worker.deferred_billed session=%s offer=%s pi=%s",
            session_id, offer_type, stripe_charge_id,
        )


async def process_stripe_event_by_id(row_id: UUID) -> None:
    """Idempotent: skips if already processed; rolls back on handler error."""
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id::text, tenant_id::text, stripe_event_id, type, payload
                FROM stripe_events
                WHERE id = $1 AND processed = false
                FOR UPDATE
                """,
                row_id,
            )
            if row is None:
                return

            type_name = row["type"]
            payload = _as_dict(row["payload"])
            tenant_id: str | None = row["tenant_id"]
            stripe_event_id: str = row["stripe_event_id"]

            try:
                if type_name == "invoice.payment_failed":
                    await payment_recovery.handle_invoice_payment_failed(
                        payload,
                        tenant_id=tenant_id,
                        stripe_event_id=stripe_event_id,
                    )
                elif type_name == "invoice.paid":
                    await handle_invoice_paid(payload, tenant_id=tenant_id)
                else:
                    logger.debug("stripe_worker.ignore type=%s id=%s", type_name, row_id)
            except Exception:
                logger.exception("stripe_worker.handler_failed type=%s id=%s", type_name, row_id)
                raise

            await conn.execute(
                "UPDATE stripe_events SET processed = true WHERE id = $1",
                row_id,
            )
