"""Proactive outreach  Claude drafts personalised emails for high-risk subscribers.

Called after churn scoring. Generates content, stores a SaveSession with
trigger_type='prediction_outreach', and sends via Resend if a customer email
is available (looked up from payment_retries which store emails from Stripe invoices).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import asyncio

import resend
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from churnq_agents import db as _db
from churnq_agents.config import get_settings

logger = logging.getLogger(__name__)

_HAIKU = "claude-haiku-4-5-20251001"


async def _lookup_customer_email(tenant_id: str, subscriber_id: str) -> str | None:
    """Best-effort: find an email we've seen for this subscriber via Stripe invoices."""
    async with _db.pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT customer_email
            FROM payment_retries
            WHERE tenant_id = $1::uuid
              AND customer_id = $2
              AND customer_email IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            tenant_id,
            subscriber_id,
        )
    return row["customer_email"] if row else None


async def _generate_outreach_content(subscriber: dict[str, Any]) -> dict[str, str]:
    """Use Claude Haiku to draft a personalised retention email."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return _fallback_content(subscriber)

    mrr = subscriber.get("avg_mrr", 0)
    cancel_attempts = subscriber.get("cancel_attempts", 0)
    failed_payments = subscriber.get("failed_payments", 0)
    days_inactive = subscriber.get("days_since_activity", 0)

    # Build offer based on MRR tier
    if mrr >= 200:
        offer_hint = "You may offer up to 40% off for 3 months or a dedicated success call."
    elif mrr >= 50:
        offer_hint = "You may offer up to 25% off for 2 months or a 1-month free pause."
    else:
        offer_hint = "You may offer a 1-week free extension or a lower-tier plan."

    signals = []
    if cancel_attempts > 0:
        signals.append(f"has visited the cancel page {cancel_attempts} time(s)")
    if failed_payments > 0:
        signals.append(f"had {failed_payments} recent payment failure(s)")
    if days_inactive > 14:
        signals.append(f"has been inactive for {int(days_inactive)} days")

    signal_text = "; ".join(signals) if signals else "showing reduced engagement"

    prompt = f"""Write a short, proactive retention email from a SaaS product to a customer at risk of churning.

Customer signals: {signal_text}
Monthly subscription value: ${mrr:.2f}
Offer available: {offer_hint}

Rules:
- Warm, personal tone  not salesy
- 2-3 short paragraphs
- One clear, specific offer
- No markdown, plain text only
- Subject line should feel personal, not like a marketing blast

Respond with JSON: {{"subject": "...", "body": "..."}}"""

    try:
        llm = ChatAnthropic(model=_HAIKU, api_key=settings.anthropic_api_key, max_tokens=400)
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        text = resp.content.strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            subject = data.get("subject", "")
            body = data.get("body", "")
            if subject and body:
                return {"subject": subject, "body": body}
    except Exception:
        logger.exception("outreach.generate_failed subscriber=%s", subscriber.get("subscriber_id"))

    return _fallback_content(subscriber)


def _fallback_content(subscriber: dict[str, Any]) -> dict[str, str]:
    mrr = subscriber.get("avg_mrr", 0)
    return {
        "subject": "We noticed you haven't been around  can we help?",
        "body": (
            f"Hi,\n\n"
            f"We noticed you haven't been active recently and wanted to check in.\n\n"
            f"If something isn't working or the product isn't meeting your needs, "
            f"we'd love to hear about it  and we'd like to make it right.\n\n"
            f"Reply to this email and we'll personally help you get the most out of your subscription."
            + (f"\n\nAs a thank-you for being a valued customer (${mrr:.2f}/mo), "
               f"we're happy to offer you a discount or a free month if that helps." if mrr >= 30 else "")
        ),
    }


async def _store_outreach_session(
    tenant_id: str,
    subscriber: dict[str, Any],
    content: dict[str, str],
) -> None:
    import uuid as _uuid
    async with _db.pool().acquire() as conn:
        await conn.execute(
            """
            INSERT INTO save_sessions
                (session_id, tenant_id, trigger_type, subscriber_id, subscription_mrr, transcript)
            VALUES ($1::uuid, $2::uuid, 'prediction_outreach', $3, $4, $5::jsonb)
            """,
            str(_uuid.uuid4()),
            tenant_id,
            subscriber["subscriber_id"],
            subscriber.get("avg_mrr", 0),
            json.dumps({
                "v": 1,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "subject": content["subject"],
                "body": content["body"],
                "risk_score": subscriber.get("risk_score"),
                "signals": {
                    "cancel_attempts":     subscriber.get("cancel_attempts", 0),
                    "failed_payments":     subscriber.get("failed_payments", 0),
                    "days_since_activity": subscriber.get("days_since_activity", 0),
                },
            }),
        )


async def _send_outreach_email(customer_email: str, content: dict[str, str]) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        return False
    resend.api_key = settings.resend_api_key
    html_body = "<br>".join(f"<p>{p.strip()}</p>" for p in content["body"].split("\n\n") if p.strip())
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from":    settings.resend_from_email,
            "to":      [customer_email],
            "subject": content["subject"],
            "html":    html_body,
        })
        logger.info("outreach.email_sent to=%s", customer_email)
        return True
    except Exception:
        logger.exception("outreach.email_failed to=%s", customer_email)
        return False


async def send_proactive_outreach(tenant_id: str, subscriber: dict[str, Any]) -> dict[str, Any]:
    sub_id = subscriber["subscriber_id"]

    customer_email = await _lookup_customer_email(tenant_id, sub_id)
    content = await _generate_outreach_content(subscriber)
    await _store_outreach_session(tenant_id, subscriber, content)

    email_sent = False
    if customer_email:
        email_sent = await _send_outreach_email(customer_email, content)
    else:
        logger.info("outreach.no_email subscriber=%s (stored only)", sub_id)

    logger.info(
        "outreach.done subscriber=%s email_sent=%s risk_score=%.4f",
        sub_id, email_sent, subscriber.get("risk_score", 0),
    )
    return {"subscriber_id": sub_id, "email_sent": email_sent}
