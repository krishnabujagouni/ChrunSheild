"""Internal endpoints to trigger agent runs (churn prediction, feedback digest)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from churnq_agents import db as _db
from churnq_agents.agents import billing, churn_prediction, feedback_analyser

router = APIRouter()


class TenantBody(BaseModel):
    tenant_id: str


class FeedbackBody(BaseModel):
    tenant_id: str
    period_days: int = 30


@router.post("/churn-prediction")
async def trigger_churn_prediction(body: TenantBody) -> dict[str, Any]:
    try:
        return await churn_prediction.run_churn_prediction(body.tenant_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/feedback-digest")
async def trigger_feedback_digest(body: FeedbackBody) -> dict[str, Any]:
    try:
        return await feedback_analyser.run_feedback_analysis(body.tenant_id, body.period_days)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/churn-predictions/{tenant_id}")
async def get_churn_predictions(tenant_id: str, risk_class: str | None = None) -> dict[str, Any]:
    try:
        async with _db.pool().acquire() as conn:
            if risk_class:
                rows = await conn.fetch(
                    """
                    SELECT subscriber_id, risk_score, risk_class, features, predicted_at
                    FROM churn_predictions
                    WHERE tenant_id = $1::uuid AND risk_class = $2
                    ORDER BY risk_score DESC
                    LIMIT 200
                    """,
                    tenant_id,
                    risk_class,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT subscriber_id, risk_score, risk_class, features, predicted_at
                    FROM churn_predictions
                    WHERE tenant_id = $1::uuid
                    ORDER BY risk_score DESC
                    LIMIT 200
                    """,
                    tenant_id,
                )
        return {
            "tenant_id": tenant_id,
            "count": len(rows),
            "predictions": [dict(r) for r in rows],
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/feedback-digests/{tenant_id}")
async def get_feedback_digests(tenant_id: str, limit: int = 5) -> dict[str, Any]:
    try:
        async with _db.pool().acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id::text, period_days, transcript_count, digest_text, created_at
                FROM feedback_digests
                WHERE tenant_id = $1::uuid
                ORDER BY created_at DESC
                LIMIT $2
                """,
                tenant_id,
                limit,
            )
        return {"tenant_id": tenant_id, "digests": [dict(r) for r in rows]}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/billing-sweep")
async def trigger_billing_sweep() -> dict[str, Any]:
    """Manually trigger the 30-day save confirmation + Stripe Connect billing sweep."""
    try:
        return await billing.run_billing_sweep()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
