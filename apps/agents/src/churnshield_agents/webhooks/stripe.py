"""Stripe webhook ingress  verified, idempotent rows in `stripe_events`."""

from __future__ import annotations

import json
from typing import Any

import stripe
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

from churnshield_agents.config import get_settings
from churnshield_agents import db
from churnshield_agents.workers import stripe_worker

router = APIRouter()


def _event_to_dict(event: Any) -> dict[str, Any]:
    if isinstance(event, dict):
        return event
    fn = getattr(event, "to_dict_recursive", None)
    if callable(fn):
        return fn()
    fn = getattr(event, "to_dict", None)
    if callable(fn):
        return fn()
    return json.loads(json.dumps(event, default=str))


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET not configured")
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    body = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            body,
            stripe_signature,
            settings.stripe_webhook_secret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid payload") from exc
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc

    payload = _event_to_dict(event)
    event_id = payload.get("id")
    type_name = payload.get("type")
    if not event_id or not type_name:
        raise HTTPException(status_code=400, detail="Malformed event")

    livemode = bool(payload.get("livemode", False))
    connected_account_id = payload.get("account") if isinstance(payload.get("account"), str) else None

    if not settings.database_url:
        return {"received": True, "stored": False, "reason": "database_not_configured"}

    tenant_uuid = await db.tenant_id_for_stripe_account(connected_account_id)
    row_id = await db.insert_stripe_event(
        tenant_id=tenant_uuid,
        stripe_event_id=event_id,
        type_name=type_name,
        payload=payload,
        livemode=livemode,
    )
    if row_id is not None:
        background_tasks.add_task(stripe_worker.process_stripe_event_by_id, row_id)
    return {"received": True, "stored": row_id is not None, "type": type_name}
