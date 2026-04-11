"""Churn prediction  plain async pipeline, heuristic risk scoring + DB upsert.

No LangGraph: the flow is a simple linear fetch → score → store with no branching,
no LLM calls, and no cycles. A plain function is clearer and faster.
Replace _score() weights with a trained sklearn model once labelled data exists.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import http.client
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Any

from churnq_agents import db as _db
from churnq_agents.agents import outreach
from churnq_agents.agents.merchant_email import get_owner_email, send_merchant_email

logger = logging.getLogger(__name__)

_HIGH = 0.60
_MED  = 0.30


def _score(row: dict[str, Any]) -> float:
    """Weighted heuristic: failed payments (40%), cancel attempts (35%), inactivity (25%)."""
    failed  = min(row.get("failed_payments", 0)      / 3.0,  1.0)
    cancels = min(row.get("cancel_attempts", 0)       / 2.0,  1.0)
    days    = min(row.get("days_since_activity", 0)   / 90.0, 1.0)
    return round(0.40 * failed + 0.35 * cancels + 0.25 * days, 4)


async def _fetch_subscribers(tenant_id: str) -> list[dict[str, Any]]:
    async with _db.pool().acquire() as conn:
        session_rows = await conn.fetch(
            """
            SELECT
                subscriber_id,
                COUNT(*) FILTER (WHERE trigger_type = 'cancel_attempt') AS cancel_attempts,
                EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400   AS days_since_activity,
                AVG(subscription_mrr::numeric)                           AS avg_mrr
            FROM save_sessions
            WHERE tenant_id = $1::uuid
              AND created_at >= NOW() - INTERVAL '90 days'
            GROUP BY subscriber_id
            """,
            tenant_id,
        )
        payment_rows = await conn.fetch(
            """
            SELECT
                payload->'data'->'object'->>'customer' AS customer_id,
                COUNT(*)                                AS cnt
            FROM stripe_events
            WHERE tenant_id = $1::uuid
              AND type = 'invoice.payment_failed'
              AND received_at >= NOW() - INTERVAL '90 days'
            GROUP BY 1
            """,
            tenant_id,
        )

    failed_map: dict[str, int] = {
        r["customer_id"]: int(r["cnt"])
        for r in payment_rows
        if r["customer_id"]
    }
    return [
        {
            "subscriber_id":       r["subscriber_id"],
            "cancel_attempts":     int(r["cancel_attempts"]),
            "days_since_activity": float(r["days_since_activity"] or 0),
            "avg_mrr":             float(r["avg_mrr"] or 0),
            "failed_payments":     failed_map.get(r["subscriber_id"], 0),
        }
        for r in session_rows
    ]


def _score_all(subscribers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scores = []
    for sub in subscribers:
        s = _score(sub)
        scores.append({
            **sub,
            "risk_score": s,
            "risk_class": "high" if s >= _HIGH else "medium" if s >= _MED else "low",
        })
    return scores


async def _store_predictions(tenant_id: str, scores: list[dict[str, Any]]) -> None:
    if not scores:
        return
    async with _db.pool().acquire() as conn:
        import uuid as _uuid
        await conn.executemany(
            """
            INSERT INTO churn_predictions
                (id, tenant_id, subscriber_id, risk_score, risk_class, features)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
            ON CONFLICT (tenant_id, subscriber_id) DO UPDATE SET
                risk_score   = EXCLUDED.risk_score,
                risk_class   = EXCLUDED.risk_class,
                features     = EXCLUDED.features,
                predicted_at = NOW()
            """,
            [
                (
                    str(_uuid.uuid4()),
                    tenant_id,
                    s["subscriber_id"],
                    s["risk_score"],
                    s["risk_class"],
                    json.dumps({
                        "failed_payments":     s["failed_payments"],
                        "cancel_attempts":     s["cancel_attempts"],
                        "days_since_activity": s["days_since_activity"],
                        "avg_mrr":             s["avg_mrr"],
                    }),
                )
                for s in scores
            ],
        )


async def _get_tenant_notification_urls(tenant_id: str) -> tuple[str | None, str | None, str | None]:
    """Returns (slack_webhook_url, discord_webhook_url, tenant_name)."""
    try:
        async with _db.pool().acquire() as conn:
            row = await conn.fetchrow(
                "SELECT slack_webhook_url, discord_webhook_url, name FROM tenants WHERE id = $1::uuid",
                tenant_id,
            )
        if row:
            return row["slack_webhook_url"], row["discord_webhook_url"], row["name"]
    except Exception:
        logger.exception("churn.notification_url_fetch tenant=%s", tenant_id)
    return None, None, None


def _http_post_bytes(
    url: str,
    body: bytes,
    headers: dict[str, str],
    timeout: float,
) -> tuple[int | None, bytes, str | None]:
    """POST without following redirects. Returns (status, body_prefix, error_message)."""
    conn: http.client.HTTPConnection | http.client.HTTPSConnection | None = None
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return None, b"", "bad_url"
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None, b"", "bad_scheme"
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    host = parsed.hostname
    conn_cls = http.client.HTTPConnection if parsed.scheme == "http" else http.client.HTTPSConnection
    try:
        conn = conn_cls(host, port=parsed.port, timeout=timeout) if parsed.port is not None else conn_cls(host, timeout=timeout)
        conn.request("POST", path, body=body, headers=headers)
        resp = conn.getresponse()
        status = resp.status
        chunk = resp.read(512)
        return status, chunk, None
    except Exception as e:
        return None, b"", str(e) or "request_failed"
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _post_webhook(webhook_url: str, payload: dict) -> None:
    body = json.dumps(payload).encode()
    status, _chunk, _err = _http_post_bytes(
        webhook_url, body, {"Content-Type": "application/json"}, 5.0
    )
    if status is None or not (200 <= status < 300):
        pass  # Non-blocking


async def _send_slack_high_risk(webhook_url: str, tenant_name: str, sub: dict[str, Any]) -> None:
    score_pct = round(sub["risk_score"] * 100)
    payload = {
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":warning: *High-risk subscriber detected  {tenant_name}*",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Customer*\n{sub['subscriber_id']}"},
                    {"type": "mrkdwn", "text": f"*Risk score*\n{score_pct}% (high)"},
                    {"type": "mrkdwn", "text": f"*Cancel attempts*\n{sub['cancel_attempts']}"},
                    {"type": "mrkdwn", "text": f"*Failed payments*\n{sub['failed_payments']}"},
                    {"type": "mrkdwn", "text": f"*Days inactive*\n{round(sub['days_since_activity'])}d"},
                ],
            },
            {"type": "divider"},
        ]
    }
    await asyncio.to_thread(_post_webhook, webhook_url, payload)


async def _send_discord_high_risk(webhook_url: str, tenant_name: str, sub: dict[str, Any]) -> None:
    score_pct = round(sub["risk_score"] * 100)
    payload = {
        "embeds": [
            {
                "title": f"\u26a0\ufe0f High-risk subscriber \u2014 {tenant_name}",
                "color": 0xF59E0B,
                "fields": [
                    {"name": "Customer", "value": sub["subscriber_id"], "inline": True},
                    {"name": "Risk score", "value": f"{score_pct}% (high)", "inline": True},
                    {"name": "Cancel attempts", "value": str(sub["cancel_attempts"]), "inline": True},
                    {"name": "Failed payments", "value": str(sub["failed_payments"]), "inline": True},
                    {"name": "Days inactive", "value": f"{round(sub['days_since_activity'])}d", "inline": True},
                ],
            }
        ]
    }
    await asyncio.to_thread(_post_webhook, webhook_url, payload)


async def _get_webhook_endpoints(tenant_id: str, event: str) -> list[dict[str, Any]]:
    """Fetch enabled webhook endpoints subscribed to `event` for this tenant."""
    try:
        async with _db.pool().acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, url, secret
                FROM webhook_endpoints
                WHERE tenant_id = $1::uuid
                  AND enabled = true
                  AND $2 = ANY(events)
                """,
                tenant_id,
                event,
            )
        return [{"id": str(r["id"]), "url": r["url"], "secret": r["secret"]} for r in rows]
    except Exception:
        logger.exception("churn.webhook_fetch tenant=%s", tenant_id)
        return []


def _sign_webhook(secret: str, body: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


_WEBHOOK_TIMEOUT_S = 5
_WEBHOOK_MAX_ATTEMPTS = 3


def _deliver_webhook_with_log(
    tenant_id: str,
    endpoint_id: str,
    url: str,
    secret: str,
    event: str,
    data: dict,
    *,
    is_test: bool = False,
) -> dict[str, Any]:
    """POST signed JSON with retries; returns row fields for webhook_deliveries."""
    payload = json.dumps({"event": event, "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", "data": data})
    sig = _sign_webhook(secret, payload)
    t0 = time.monotonic()
    last_http: int | None = None
    last_err: str | None = None
    response_preview: str | None = None
    attempts_used = 0
    ok = False

    hdrs = {
        "Content-Type": "application/json",
        "X-ChurnQ-Signature": sig,
        "X-ChurnQ-Event": event,
    }
    for attempt in range(1, _WEBHOOK_MAX_ATTEMPTS + 1):
        attempts_used = attempt
        status, chunk, req_err = _http_post_bytes(url, payload.encode(), hdrs, float(_WEBHOOK_TIMEOUT_S))
        if req_err:
            last_err = req_err
            last_http = None
            response_preview = None
        else:
            last_http = status
            response_preview = chunk.decode("utf-8", errors="replace")[:512] if chunk else None
            if status is not None and 300 <= status < 400:
                last_err = "HTTP %d redirect  use the direct URL (redirects are not followed)" % status
            elif status is not None and 200 <= status < 300:
                ok = True
                break
            elif status == 404:
                last_err = (
                    "HTTP 404  no POST handler at this path (wrong token in the URL, typo, or expired URL)"
                )
            else:
                last_err = f"HTTP {status}" if status is not None else "no_status"
        if attempt < _WEBHOOK_MAX_ATTEMPTS:
            time.sleep(attempt * 1.5)

    duration_ms = int((time.monotonic() - t0) * 1000)
    return {
        "id": uuid.uuid4(),
        "webhook_endpoint_id": uuid.UUID(endpoint_id),
        "tenant_id": uuid.UUID(tenant_id),
        "event": event,
        "status": "delivered" if ok else "failed",
        "http_status": last_http,
        "error_message": None if ok else last_err,
        "response_preview": response_preview,
        "payload": payload,
        "attempts": attempts_used,
        "duration_ms": duration_ms,
        "is_test": is_test,
    }


async def _insert_webhook_delivery(row: dict[str, Any]) -> None:
    try:
        async with _db.pool().acquire() as conn:
            await conn.execute(
                """
                INSERT INTO webhook_deliveries (
                    id, webhook_endpoint_id, tenant_id, event, status, http_status,
                    error_message, response_preview, payload, attempts, duration_ms, is_test, created_at
                )
                VALUES (
                    $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
                )
                """,
                row["id"],
                row["webhook_endpoint_id"],
                row["tenant_id"],
                row["event"],
                row["status"],
                row["http_status"],
                row["error_message"],
                row["response_preview"],
                row["payload"],
                row["attempts"],
                row["duration_ms"],
                row["is_test"],
            )
    except Exception:
        logger.exception("churn.webhook_delivery_log_failed tenant=%s", row.get("tenant_id"))


async def _fire_webhooks(tenant_id: str, event: str, data: dict) -> None:
    endpoints = await _get_webhook_endpoints(tenant_id, event)
    for ep in endpoints:
        try:
            row = await asyncio.to_thread(
                _deliver_webhook_with_log,
                tenant_id,
                ep["id"],
                ep["url"],
                ep["secret"],
                event,
                data,
            )
            await _insert_webhook_delivery(row)
        except Exception:
            logger.exception("churn.webhook_failed tenant=%s endpoint=%s", tenant_id, ep.get("id"))


async def run_churn_prediction(tenant_id: str) -> dict[str, Any]:
    subscribers = await _fetch_subscribers(tenant_id)
    logger.info("churn.fetch tenant=%s n=%d", tenant_id, len(subscribers))

    scores = _score_all(subscribers)
    high_risk = [s for s in scores if s["risk_class"] == "high"]
    logger.info("churn.score tenant=%s total=%d high=%d", tenant_id, len(scores), len(high_risk))

    await _store_predictions(tenant_id, scores)
    logger.info("churn.store tenant=%s rows=%d", tenant_id, len(scores))

    slack_url, discord_url, tenant_name = await _get_tenant_notification_urls(tenant_id)

    for sub in high_risk:
        try:
            await outreach.send_proactive_outreach(tenant_id, sub)
        except Exception:
            logger.exception("churn.outreach_failed subscriber=%s", sub["subscriber_id"])
        if slack_url and tenant_name:
            try:
                await _send_slack_high_risk(slack_url, tenant_name, sub)
            except Exception:
                logger.exception("churn.slack_failed subscriber=%s", sub["subscriber_id"])
        if discord_url and tenant_name:
            try:
                await _send_discord_high_risk(discord_url, tenant_name, sub)
            except Exception:
                logger.exception("churn.discord_failed subscriber=%s", sub["subscriber_id"])
        try:
            await _fire_webhooks(tenant_id, "high_risk.detected", {
                "tenant_id":           tenant_id,
                "subscriber_id":       sub["subscriber_id"],
                "risk_score":          sub["risk_score"],
                "risk_class":          sub["risk_class"],
                "cancel_attempts":     sub["cancel_attempts"],
                "failed_payments":     sub["failed_payments"],
                "days_since_activity": round(sub["days_since_activity"], 1),
            })
        except Exception:
            logger.exception("churn.webhook_failed subscriber=%s", sub["subscriber_id"])

    # #4: High-risk alert email to merchant
    if high_risk:
        try:
            owner_email = await get_owner_email(tenant_id)
            if owner_email:
                n = len(high_risk)
                plural = "s" if n != 1 else ""
                subject = f"[ChurnQ] {n} high-risk subscriber{plural} detected"
                html = (
                    f"<p>Hi,</p>"
                    f"<p>ChurnQ has identified <strong>{n} high-risk subscriber{plural}</strong> "
                    f"in your account and has automatically sent proactive retention emails.</p>"
                    f"<p>Log in to your dashboard to review risk scores and outreach activity.</p>"
                    f"<p> ChurnQ</p>"
                )
                await send_merchant_email(owner_email, subject, html)
                logger.info("churn.alert_email_sent tenant=%s high_risk=%d", tenant_id, n)
        except Exception:
            logger.exception("churn.alert_email_failed tenant=%s", tenant_id)

    return {
        "tenant_id":       tenant_id,
        "total_scored":    len(scores),
        "high_risk_count": len(high_risk),
        "high_risk_ids":   [s["subscriber_id"] for s in high_risk],
    }
