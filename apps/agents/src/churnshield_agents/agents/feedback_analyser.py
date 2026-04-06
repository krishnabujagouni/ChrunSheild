"""Feedback analyser  LangGraph pipeline: fetch → extract → cluster → summarize → digest → store.

Framework choice: LangGraph (not CrewAI)  single framework across all agents avoids dependency
conflicts between CrewAI and LangGraph's shared langchain-core transitive deps.
Clustering uses scikit-learn TF-IDF + KMeans (no embeddings API needed).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from typing_extensions import TypedDict

from churnshield_agents import db as _db
from churnshield_agents.config import get_settings

logger = logging.getLogger(__name__)

_MIN_FOR_CLUSTERING = 3
_MAX_CLUSTERS = 6
_HAIKU = "claude-haiku-4-5-20251001"


class FeedbackState(TypedDict):
    tenant_id: str
    period_days: int
    transcripts: list[dict[str, Any]]
    texts: list[str]
    clusters: dict  # int → list[str]
    summaries: dict  # int → str
    digest: str
    stored: bool
    skipped: bool


def _transcript_to_text(t: Any) -> str:
    if not isinstance(t, dict):
        return ""
    return " ".join(
        m.get("content", "")
        for m in t.get("messages", [])
        if m.get("role") == "user" and m.get("content")
    ).strip()


async def _fetch(state: FeedbackState) -> FeedbackState:
    async with _db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT session_id::text, transcript
            FROM save_sessions
            WHERE tenant_id = $1::uuid
              AND transcript IS NOT NULL
              AND trigger_type = 'cancel_attempt'
              AND created_at >= NOW() - ($2 || ' days')::INTERVAL
            ORDER BY created_at DESC
            LIMIT 500
            """,
            state["tenant_id"],
            str(state["period_days"]),
        )
    transcripts = []
    for r in rows:
        raw = r["transcript"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                continue
        if isinstance(raw, dict):
            transcripts.append({"session_id": r["session_id"], "transcript": raw})
    logger.info("feedback.fetch tenant=%s n=%d", state["tenant_id"], len(transcripts))
    return {**state, "transcripts": transcripts}


async def _check_watermark(state: FeedbackState) -> FeedbackState:
    """Skip the pipeline if no new transcripts have arrived since the last digest."""
    if not state["transcripts"]:
        logger.info("feedback.skip tenant=%s reason=no_transcripts_in_period", state["tenant_id"])
        return {**state, "skipped": True}

    async with _db.pool().acquire() as conn:
        last_digest = await conn.fetchrow(
            "SELECT created_at FROM feedback_digests WHERE tenant_id = $1::uuid ORDER BY created_at DESC LIMIT 1",
            state["tenant_id"],
        )
        if last_digest is None:
            # First-ever digest  always run
            return {**state, "skipped": False}

        new_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM save_sessions
            WHERE tenant_id = $1::uuid
              AND transcript IS NOT NULL
              AND trigger_type = 'cancel_attempt'
              AND created_at > $2
            """,
            state["tenant_id"],
            last_digest["created_at"],
        )

    if new_count == 0:
        logger.info(
            "feedback.skip tenant=%s reason=no_new_transcripts_since=%s",
            state["tenant_id"],
            last_digest["created_at"].isoformat(),
        )
        return {**state, "skipped": True}

    return {**state, "skipped": False}


async def _extract(state: FeedbackState) -> FeedbackState:
    texts = [
        t
        for item in state["transcripts"]
        if len(t := _transcript_to_text(item["transcript"])) >= 10
    ]
    return {**state, "texts": texts}


async def _cluster(state: FeedbackState) -> FeedbackState:
    texts = state["texts"]
    if len(texts) < _MIN_FOR_CLUSTERING:
        return {**state, "clusters": {0: texts}}

    n = min(_MAX_CLUSTERS, max(2, len(texts) // 5))
    vec = TfidfVectorizer(max_features=500, stop_words="english", min_df=1)
    X = vec.fit_transform(texts)
    labels = KMeans(n_clusters=n, random_state=42, n_init=10).fit_predict(X)

    clusters: dict[int, list[str]] = {}
    for text, label in zip(texts, labels.tolist()):
        clusters.setdefault(label, []).append(text)

    logger.info("feedback.cluster tenant=%s n=%d", state["tenant_id"], len(clusters))
    return {**state, "clusters": clusters}


async def _summarize(state: FeedbackState) -> FeedbackState:
    settings = get_settings()
    if not settings.anthropic_api_key or not state["clusters"]:
        return {**state, "summaries": {k: f"Theme {k + 1}: {len(v)} responses" for k, v in state["clusters"].items()}}

    llm = ChatAnthropic(model=_HAIKU, api_key=settings.anthropic_api_key, max_tokens=128)
    summaries: dict[int, str] = {}
    for cid, cluster_texts in state["clusters"].items():
        sample = "\n".join(f"- {t[:200]}" for t in cluster_texts[:8])
        resp = await llm.ainvoke([
            HumanMessage(content=f"Summarize the common cancellation reason in one sentence (max 25 words):\n{sample}")
        ])
        summaries[cid] = resp.content.strip()
    return {**state, "summaries": summaries}


async def _compose(state: FeedbackState) -> FeedbackState:
    settings = get_settings()
    total = len(state["texts"])
    summaries = state["summaries"]

    if not settings.anthropic_api_key or not summaries:
        lines = [f"Feedback digest ({total} sessions, {len(summaries)} themes):"]
        for cid, s in summaries.items():
            lines.append(f"• {s} ({len(state['clusters'].get(cid, []))} responses)")
        return {**state, "digest": "\n".join(lines)}

    llm = ChatAnthropic(model=_HAIKU, api_key=settings.anthropic_api_key, max_tokens=512)
    themes = "\n".join(
        f"{i + 1}. {s} ({len(state['clusters'].get(cid, []))} responses)"
        for i, (cid, s) in enumerate(summaries.items())
    )
    resp = await llm.ainvoke([
        HumanMessage(content=(
            f"Write a weekly cancellation feedback digest for the product team.\n"
            f"Total sessions: {total}\nThemes:\n{themes}\n\n"
            f"Write 3-5 actionable bullet points. Be concise and specific."
        ))
    ])
    return {**state, "digest": resp.content.strip()}


async def _embed_text(text: str, voyage_api_key: str) -> list[float] | None:
    """
    Generate a 512-dim embedding using voyage-3-lite via the voyageai SDK.
    Returns None if the API key is missing or the call fails  embedding is best-effort.
    Requires: uv add voyageai  (or pip install voyageai)
    """
    if not voyage_api_key:
        return None
    try:
        import asyncio
        import voyageai  # type: ignore[import-untyped]
        client = voyageai.Client(api_key=voyage_api_key)
        result = await asyncio.to_thread(
            client.embed,
            [text[:8000]],
            model="voyage-3-lite",   # 512 dims, cheapest Voyage model
            input_type="document",
        )
        return result.embeddings[0]
    except Exception:
        logger.exception("feedback.embed_failed (voyage-3-lite)")
        return None


async def _store_embedding(digest_id: str, embedding: list[float]) -> None:
    """Write embedding vector to feedback_digests.embedding (requires pgvector extension)."""
    vector_str = "[" + ",".join(f"{v:.8f}" for v in embedding) + "]"
    try:
        async with _db.pool().acquire() as conn:
            await conn.execute(
                "UPDATE feedback_digests SET embedding = $1::vector WHERE id = $2::uuid",
                vector_str,
                digest_id,
            )
    except Exception:
        logger.warning("feedback.embedding_store_failed digest=%s (pgvector not enabled?)", digest_id)


async def _store(state: FeedbackState) -> FeedbackState:
    import asyncio
    import uuid
    import resend

    digest_id = str(uuid.uuid4())

    async with _db.pool().acquire() as conn:
        await conn.execute(
            """
            INSERT INTO feedback_digests
                (id, tenant_id, period_days, transcript_count, clusters, digest_text)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6)
            """,
            digest_id,
            state["tenant_id"],
            state["period_days"],
            len(state["texts"]),
            json.dumps({str(k): v for k, v in state["summaries"].items()}),
            state["digest"],
        )

        # Fetch owner email for notification
        row = await conn.fetchrow(
            "SELECT owner_email, name FROM tenants WHERE id = $1::uuid",
            state["tenant_id"],
        )

    # Generate and store embedding (best-effort  skips if voyage_api_key missing or pgvector not enabled)
    settings = get_settings()
    if settings.voyage_api_key:
        embedding = await _embed_text(state["digest"], settings.voyage_api_key)
        if embedding:
            await _store_embedding(digest_id, embedding)
            logger.info("feedback.embedding_stored digest=%s dims=%d", digest_id, len(embedding))

    logger.info("feedback.stored tenant=%s digest=%s", state["tenant_id"], digest_id)

    # Send weekly digest email to merchant
    settings = get_settings()
    owner_email = row["owner_email"] if row else None
    if owner_email and settings.resend_api_key:
        tenant_name = row["name"] if row else "Your workspace"
        html = "<br>".join(
            f"<p>{p.strip()}</p>"
            for p in state["digest"].split("\n\n")
            if p.strip()
        )
        resend.api_key = settings.resend_api_key
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": settings.resend_from_email,
                "to": [owner_email],
                "subject": f"Weekly Cancellation Digest  {tenant_name}",
                "html": f"<h2>Weekly Cancellation Feedback Digest</h2>{html}<hr><p style='color:#94a3b8;font-size:12px'>ChurnShield · {state['period_days']}-day window · {len(state['texts'])} sessions analyzed</p>",
            })
            logger.info("feedback.digest_emailed to=%s tenant=%s", owner_email, state["tenant_id"])
        except Exception:
            logger.exception("feedback.digest_email_failed tenant=%s", state["tenant_id"])

    return {**state, "stored": True}


def _build_graph() -> Any:
    g: StateGraph = StateGraph(FeedbackState)
    for name, fn in [
        ("fetch",            _fetch),
        ("check_watermark",  _check_watermark),
        ("extract",          _extract),
        ("cluster",          _cluster),
        ("summarize",        _summarize),
        ("compose",          _compose),
        ("store",            _store),
    ]:
        g.add_node(name, fn)
    g.set_entry_point("fetch")
    g.add_edge("fetch", "check_watermark")
    g.add_conditional_edges(
        "check_watermark",
        lambda s: END if s["skipped"] else "extract",
    )
    g.add_edge("extract",   "cluster")
    g.add_edge("cluster",   "summarize")
    g.add_edge("summarize", "compose")
    g.add_edge("compose",   "store")
    g.add_edge("store",     END)
    return g.compile()


_graph: Any = None


def _get_graph() -> Any:
    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


async def run_feedback_analysis(tenant_id: str, period_days: int = 30) -> dict[str, Any]:
    result: FeedbackState = await _get_graph().ainvoke({
        "tenant_id":   tenant_id,
        "period_days": period_days,
        "transcripts": [],
        "texts":       [],
        "clusters":    {},
        "summaries":   {},
        "digest":      "",
        "stored":      False,
        "skipped":     False,
    })
    if result["skipped"]:
        return {
            "tenant_id": tenant_id,
            "skipped":   True,
            "reason":    "no_new_transcripts_since_last_digest",
        }
    return {
        "tenant_id":            tenant_id,
        "skipped":              False,
        "transcripts_analyzed": len(result["texts"]),
        "themes":               len(result["summaries"]),
        "digest":               result["digest"],
    }
