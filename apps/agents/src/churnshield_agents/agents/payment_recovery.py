"""Payment recovery  classify failed invoices, AI-generated recovery emails, retry scheduling."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncio

import resend
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from churnshield_agents import db as _db
from churnshield_agents.agents.merchant_email import send_merchant_email
from churnshield_agents.config import get_settings

logger = logging.getLogger(__name__)

_HAIKU = "claude-haiku-4-5-20251001"

# Stripe decline codes → coarse failure class
_FAILURE_GROUPS: dict[str, str] = {
    "insufficient_funds":   "insufficient_funds",
    "card_declined":        "card_declined",
    "expired_card":         "expired_card",
    "incorrect_cvc":        "authentication_or_cvc",
    "incorrect_number":     "invalid_account",
    "invalid_expiry_month": "invalid_account",
    "invalid_expiry_year":  "invalid_account",
    "processing_error":     "try_again_later",
    "try_again_later":      "try_again_later",
}

# Retry delays in hours from failure timestamp ([] = email only, no auto-retry)
_RETRY_DELAYS: dict[str, list[int]] = {
    "insufficient_funds":    [72, 168, 336],
    "card_declined":         [24, 72],
    "try_again_later":       [1, 6, 24],
    "expired_card":          [],
    "authentication_or_cvc": [],
    "invalid_account":       [],
    "unknown":               [72, 168],
    "other":                 [72, 168],
}


def classify_payment_failure(stripe_code: str | None) -> str:
    if not stripe_code:
        return "unknown"
    return _FAILURE_GROUPS.get(stripe_code, "other")


def extract_invoice_failure(invoice: dict[str, Any]) -> dict[str, Any]:
    err: Any = invoice.get("last_payment_error") or invoice.get("last_finalization_error")
    if not err:
        pi = invoice.get("payment_intent")
        if isinstance(pi, dict):
            err = pi.get("last_payment_error") or {}
    if not isinstance(err, dict):
        err = {}

    code = err.get("code") or err.get("decline_code")
    return {
        "invoice_id":      invoice.get("id"),
        "customer_id":     invoice.get("customer"),
        "customer_email":  invoice.get("customer_email"),
        "subscription_id": invoice.get("subscription"),
        "failure_code":    code,
        "failure_class":   classify_payment_failure(code),
        "message":         err.get("message"),
        "amount_due":      invoice.get("amount_due", 0),
        "currency":        invoice.get("currency", "usd"),
    }


async def _generate_email_content(summary: dict[str, Any]) -> dict[str, str]:
    """Use Claude Haiku to write a personalised recovery email. Falls back to a template."""
    settings = get_settings()
    failure_class = summary.get("failure_class", "other")
    amount_cents = summary.get("amount_due", 0)
    currency = summary.get("currency", "usd").upper()
    needs_action = failure_class not in ("insufficient_funds", "try_again_later")

    if not settings.anthropic_api_key:
        return _fallback_email(summary)

    prompt = f"""Write a payment recovery email for a SaaS subscription service.

Facts:
- Amount due: ${amount_cents / 100:.2f} {currency}
- Failure type: {failure_class.replace("_", " ")}
- Customer action needed: {"yes  they must update their payment method" if needs_action else "no  we will auto-retry"}

Rules:
- 2–3 short paragraphs, warm but professional
- {"End with a single clear call to action: update payment method." if needs_action else "Reassure them no action is needed; we will retry automatically."}
- No markdown, plain text only
- Subject line should feel personal, not like a bulk campaign

Respond with JSON only: {{"subject": "...", "body": "..."}}"""

    try:
        llm = ChatAnthropic(model=_HAIKU, api_key=settings.anthropic_api_key, max_tokens=400)
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        match = re.search(r"\{.*\}", resp.content.strip(), re.DOTALL)
        if match:
            data = json.loads(match.group())
            if data.get("subject") and data.get("body"):
                return {"subject": data["subject"], "body": data["body"]}
    except Exception:
        logger.exception("payment_recovery.generate_email_failed class=%s", failure_class)

    return _fallback_email(summary)


def _fallback_email(summary: dict[str, Any]) -> dict[str, str]:
    failure_class = summary.get("failure_class", "other")
    needs_action = failure_class not in ("insufficient_funds", "try_again_later")
    invoice_id = summary.get("invoice_id", "")
    subjects = {
        "insufficient_funds":    "Your payment didn't go through",
        "card_declined":         "Payment failed  action needed",
        "expired_card":          "Your card has expired",
        "authentication_or_cvc": "Payment issue  please verify your card",
        "invalid_account":       "Payment method issue  action required",
        "try_again_later":       "We're retrying your payment",
        "unknown":               "Issue with your subscription payment",
        "other":                 "Issue with your subscription payment",
    }
    subject = subjects.get(failure_class, subjects["other"])
    if needs_action:
        body = (
            f"Hi,\n\n"
            f"We weren't able to process your recent payment (Invoice: {invoice_id}).\n\n"
            f"Please update your payment method to keep your subscription active. "
            f"Reply to this email if you need any help."
        )
    else:
        body = (
            f"Hi,\n\n"
            f"Your recent payment (Invoice: {invoice_id}) was unsuccessful. "
            f"We'll automatically retry  no action needed right now.\n\n"
            f"If retries continue to fail we'll reach out again."
        )
    return {"subject": subject, "body": body}


async def send_recovery_email(summary: dict[str, Any]) -> bool:
    """Generate an AI recovery email and send via Resend. Returns True on success."""
    settings = get_settings()
    if not settings.resend_api_key or not summary.get("customer_email"):
        return False

    content = await _generate_email_content(summary)
    html_body = "<br>".join(f"<p>{p.strip()}</p>" for p in content["body"].split("\n\n") if p.strip())

    resend.api_key = settings.resend_api_key
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from":    settings.resend_from_email,
            "to":      [summary["customer_email"]],
            "subject": content["subject"],
            "html":    html_body,
        })
        logger.info("payment_recovery.email_sent to=%s class=%s", summary["customer_email"], summary.get("failure_class"))
        return True
    except Exception:
        logger.exception("payment_recovery.email_failed to=%s", summary.get("customer_email"))
        return False


async def _schedule_retries(
    tenant_id: str | None,
    stripe_event_id: str,
    summary: dict[str, Any],
) -> None:
    delays = _RETRY_DELAYS.get(summary["failure_class"], [72, 168])
    if not delays:
        return
    first_retry_at = datetime.now(timezone.utc) + timedelta(hours=delays[0])
    async with _db.pool().acquire() as conn:
        import uuid as _uuid
        await conn.execute(
            """
            INSERT INTO payment_retries
                (id, tenant_id, stripe_event_id, invoice_id, customer_id, customer_email,
                 failure_class, delay_hours, next_retry_at, max_attempts)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::integer[], $9, $10)
            ON CONFLICT (stripe_event_id) DO NOTHING
            """,
            str(_uuid.uuid4()),
            tenant_id,
            stripe_event_id,
            summary.get("invoice_id"),
            summary.get("customer_id"),
            summary.get("customer_email"),
            summary["failure_class"],
            delays,
            first_retry_at,
            len(delays),
        )


async def handle_invoice_payment_failed(
    event_payload: dict[str, Any],
    tenant_id: str | None = None,
    stripe_event_id: str | None = None,
) -> dict[str, Any]:
    data = event_payload.get("data")
    if not isinstance(data, dict):
        return {"handled": False, "reason": "missing_data"}
    obj = data.get("object")
    if not isinstance(obj, dict):
        return {"handled": False, "reason": "missing_object"}

    summary = extract_invoice_failure(obj)
    logger.info(
        "payment_recovery.invoice_failed invoice=%s class=%s code=%s",
        summary.get("invoice_id"),
        summary.get("failure_class"),
        summary.get("failure_code"),
    )

    email_sent = await send_recovery_email(summary)

    if stripe_event_id:
        try:
            await _schedule_retries(tenant_id, stripe_event_id, summary)
        except Exception:
            logger.exception("payment_recovery.retry_schedule_failed invoice=%s", summary.get("invoice_id"))

    return {"handled": True, "summary": summary, "email_sent": email_sent}


async def run_payment_recovery_summary() -> dict[str, Any]:
    """
    #7: Weekly payment recovery update email per merchant.
    Queries the last 7 days of payment_retries activity and emails each merchant.
    Called by weekly APScheduler cron (Mon 04:30 UTC).
    """
    async with _db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                pr.tenant_id::text,
                t.owner_email,
                COUNT(*)                                            AS total,
                COUNT(*) FILTER (WHERE pr.status = 'pending')      AS pending,
                COUNT(*) FILTER (WHERE pr.status = 'exhausted')    AS exhausted,
                COUNT(*) FILTER (WHERE pr.last_error IS NULL
                                   AND pr.attempts > 0
                                   AND pr.status != 'exhausted')   AS likely_recovered
            FROM payment_retries pr
            JOIN tenants t ON t.id = pr.tenant_id
            WHERE pr.updated_at >= NOW() - INTERVAL '7 days'
              AND t.owner_email IS NOT NULL
            GROUP BY pr.tenant_id, t.owner_email
            HAVING COUNT(*) > 0
            """,
        )

    sent = 0
    for row in rows:
        owner_email = row["owner_email"]
        total = int(row["total"])
        pending = int(row["pending"])
        exhausted = int(row["exhausted"])
        likely_recovered = int(row["likely_recovered"])

        subject = "[ChurnShield] Weekly payment recovery update"
        html = (
            f"<p>Hi,</p>"
            f"<p>Here's your payment recovery summary for the past 7 days:</p>"
            f"<ul>"
            f"<li><strong>{total}</strong> failed payment{'s' if total != 1 else ''} handled</li>"
            f"<li><strong>{likely_recovered}</strong> likely recovered (retried successfully)</li>"
            f"<li><strong>{pending}</strong> still being retried automatically</li>"
            f"<li><strong>{exhausted}</strong> exhausted (no further retries)</li>"
            f"</ul>"
            f"<p>ChurnShield automatically retried failed invoices and sent recovery "
            f"emails to your subscribers on your behalf.</p>"
            f"<p> ChurnShield</p>"
        )
        try:
            await send_merchant_email(owner_email, subject, html)
            sent += 1
            logger.info("payment_recovery.summary_sent tenant=%s total=%d", row["tenant_id"], total)
        except Exception:
            logger.exception("payment_recovery.summary_failed tenant=%s", row["tenant_id"])

    return {"tenants_emailed": sent}
