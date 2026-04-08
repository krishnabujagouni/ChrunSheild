"""After webhook persistence: classify events and set `stripe_events.processed`."""

from __future__ import annotations

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
# pause included: fee charged after subscriber's invoice.paid fires when pause ends
DEFERRED_OFFER_TYPES = {"extension", "discount", "downgrade", "pause"}


def _as_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        return json.loads(payload)
    return dict(payload)



async def handle_invoice_paid(payload: dict[str, Any], tenant_id: str | None) -> None:
    """
    Confirm deferred saves when a subscriber's invoice is paid.

    ONLY confirms the save (sets outcome_confirmed_at + actual fee amount).
    Does NOT charge the tenant  all charging is done by the monthly billing
    cron on the 1st of the month so tenants receive one clean invoice per month.
    """
    if not tenant_id:
        return

    invoice = payload.get("data", {}).get("object", {})
    customer_id: str | None = invoice.get("customer")
    amount_paid: int = int(invoice.get("amount_paid", 0))
    status: str = invoice.get("status", "")

    if not customer_id or status != "paid" or amount_paid <= 0:
        return

    invoice_mrr = Decimal(amount_paid) / Decimal(100)
    fee = (invoice_mrr * FEE_RATE).quantize(Decimal("0.01"))

    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ss.session_id::text, ss.offer_type
            FROM save_sessions ss
            WHERE ss.tenant_id           = $1::uuid
              AND ss.subscriber_id       = $2
              AND ss.offer_accepted      = true
              AND ss.offer_type          = ANY($3::text[])
              AND ss.outcome_confirmed_at IS NULL
              AND ss.fee_billed_at        IS NULL
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

        # Stamp confirmation + actual fee amount  monthly cron does the Stripe charge
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
            "stripe_worker.confirmed session=%s offer=%s mrr=%.2f fee=%.2f  billing deferred to monthly cron",
            session_id, offer_type, invoice_mrr, fee,
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
