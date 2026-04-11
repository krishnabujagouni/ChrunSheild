"""Shared helpers for sending emails to the merchant (tenant owner)."""

from __future__ import annotations

import asyncio
import logging

import resend

from churnq_agents import db as _db
from churnq_agents.config import get_settings

logger = logging.getLogger(__name__)


async def get_owner_email(tenant_id: str) -> str | None:
    """Return the owner email for a tenant, or None if not set."""
    async with _db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT owner_email FROM tenants WHERE id = $1::uuid",
            tenant_id,
        )
    return row["owner_email"] if row and row["owner_email"] else None


async def send_merchant_email(to: str, subject: str, html: str) -> bool:
    """Send an email to the merchant via Resend. Returns True on success."""
    settings = get_settings()
    if not settings.resend_api_key:
        return False
    resend.api_key = settings.resend_api_key
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from":    settings.resend_from_email,
            "to":      [to],
            "subject": subject,
            "html":    html,
        })
        logger.info("merchant_email.sent to=%s subject=%r", to, subject)
        return True
    except Exception:
        logger.exception("merchant_email.failed to=%s subject=%r", to, subject)
        return False
