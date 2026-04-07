"""FastAPI app: Stripe webhooks, agent trigger APIs, APScheduler crons."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)

from churnshield_agents.config import get_settings
from churnshield_agents import db
from churnshield_agents.webhooks import stripe as stripe_webhooks
from churnshield_agents.routers import agents as agents_router
from churnshield_agents.jobs import queue


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.database_url:
        try:
            await db.connect()
            logging.info("Database connected")
        except Exception as e:
            logging.error("Database connection failed (non-fatal): %s", e)
    try:
        queue.start_scheduler()
    except Exception as e:
        logging.error("Scheduler start failed (non-fatal): %s", e)
    yield
    try:
        queue.stop_scheduler()
    except Exception:
        pass
    await db.disconnect()


app = FastAPI(title="ChurnShield Agents", version="0.1.0", lifespan=lifespan)
app.include_router(stripe_webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(agents_router.router, prefix="/agents", tags=["agents"])


@app.get("/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "database_configured": bool(settings.database_url),
        "stripe_configured": bool(settings.stripe_secret_key),
        "email_configured": bool(settings.resend_api_key),
        "ai_configured": bool(settings.anthropic_api_key),
    }


def run():
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("churnshield_agents.main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    run()
