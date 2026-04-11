import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { generateText } from "ai";
import { getCancelAgentModel } from "@/lib/cancel-agent";
import { selectDigestsForAnalyst } from "@/lib/feedback-digest-retrieval";

/**
 * POST /api/feedback/search
 * Body: { q: string; history?: Array<{ question: string; answer: string }> }
 *
 * Returns an AI analyst answer grounded in the merchant's digest summaries
 * and raw cancellation transcripts. Conversation history is passed to Claude
 * so follow-up questions have full context.
 */

function extractUserMessages(transcript: unknown): string[] {
  if (!transcript || typeof transcript !== "object") return [];
  const t = transcript as { messages?: Array<{ role: string; content: string }> };
  if (!Array.isArray(t.messages)) return [];
  return t.messages
    .filter(m => m.role === "user" && typeof m.content === "string" && m.content.trim().length > 3)
    .map(m => m.content.trim())
    .slice(0, 5);
}

type HistoryTurn = { question: string; answer: string };

/** How many recent turns to keep verbatim  older turns get compressed */
const RECENT_TURNS = 4;

/**
 * Compress older turns into compact bullet points.
 * Each bullet is ~30-40 tokens vs ~200 tokens for the full turn.
 * No extra AI call needed  just structured text compression.
 */
function compressOlderTurns(turns: HistoryTurn[]): string {
  return turns
    .map(t => `• "${t.question.slice(0, 80)}" → ${t.answer.replace(/\n+/g, " ").slice(0, 140)}…`)
    .join("\n");
}

function buildAnalystPrompt(
  query: string,
  history: HistoryTurn[],
  digests: Array<{ digestText: string; periodDays: number; transcriptCount: number; createdAt: Date }>,
  transcriptSnippets: Array<{
    mrr: number;
    offerType: string | null;
    accepted: boolean;
    offerMade: string | null;
    savedValue: number | null;
    messages: string[];
  }>,
): string {
  const digestSection = digests.length > 0
    ? digests.map((d, i) =>
        `[Digest ${i + 1}  ${d.periodDays}-day window, ${d.transcriptCount} sessions, ${d.createdAt.toDateString()}]\n${d.digestText}`
      ).join("\n\n---\n\n")
    : "No digests available yet.";

  const sessionLines = transcriptSnippets
    .filter(s => s.messages.length > 0 || s.offerMade)
    .slice(0, 20)
    .map((s, i) => {
      const outcome = s.accepted
        ? `accepted ${s.offerType ?? "offer"}`
        : s.offerType ? `declined ${s.offerType}` : "cancelled without offer";
      const tier = s.mrr >= 100 ? "high-value" : s.mrr >= 30 ? "mid-tier" : "low-tier";
      const offerLine = s.offerMade?.trim()
        ? `  Offer text (stored on session): ${s.offerMade.trim().replace(/\s+/g, " ")}`
        : "";
      const savedLine =
        s.accepted && s.savedValue != null && s.savedValue > 0
          ? `  Reported value saved: $${s.savedValue.toFixed(2)}`
          : "";
      const voiceLines =
        s.messages.length > 0
          ? s.messages.map(m => `  Subscriber: "${m}"`).join("\n")
          : "  (no subscriber messages extracted)";
      return `Session ${i + 1} ($${s.mrr}/mo, ${tier}, ${outcome}):\n${[offerLine, savedLine].filter(Boolean).join("\n")}${offerLine || savedLine ? "\n" : ""}${voiceLines}`;
    }).join("\n\n");

  // Split history: older turns compressed, last RECENT_TURNS kept verbatim
  const olderTurns  = history.slice(0, -RECENT_TURNS);
  const recentTurns = history.slice(-RECENT_TURNS);

  const historySection = history.length === 0 ? "" : `────────────────────────────────────────
CONVERSATION CONTEXT:
${olderTurns.length > 0
  ? `Earlier context (compressed  ${olderTurns.length} turn${olderTurns.length > 1 ? "s" : ""}):\n${compressOlderTurns(olderTurns)}\n\n`
  : ""}${recentTurns.length > 0
  ? `Recent conversation (verbatim):\n${recentTurns.map((h, i) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n")}`
  : ""}
────────────────────────────────────────`;

  return `You are an expert customer insights analyst embedded in ChurnQ, a retention tool for SaaS merchants.
Your job is to help the merchant deeply understand why their subscribers cancel and what to do about it.

────────────────────────────────────────
CANCELLATION DATA:

WEEKLY DIGEST SUMMARIES:
${digestSection}

RECENT SESSIONS (newest first  includes stored offer copy and subscriber messages):
${sessionLines || "No session detail available yet."}
────────────────────────────────────────
${historySection}

MERCHANT'S CURRENT QUESTION: "${query}"

Answer guidelines:
- Be direct and specific. Reference actual numbers, MRR tiers, offer outcomes where visible in the data.
- Write in second person: "your subscribers", "your pricing", "your save rate".
- If this is a follow-up question, build on the conversation above  do not repeat what was already said.
- End with 1 concrete action the merchant can take this week.
- Use "Offer text (stored on session)" and "Reported value saved" when answering what was offered or saved; use subscriber lines for why they churned.
- If data is thin or ambiguous, say so  never invent specifics not present in the data.
- Max 80 words. Be sharp and direct  no intros, no padding, no restating the question.
- Use **bold** for the single most important number or finding. One short paragraph or 2-3 tight bullets max.`;
}

export async function POST(request: Request) {
  const traceId = randomUUID().slice(0, 8);
  const log = (step: string, extra?: Record<string, unknown>) => {
    const line = `[feedback-search ${traceId}] [route] ${step}`;
    if (extra && Object.keys(extra).length > 0) console.log(line, extra);
    else console.log(line);
  };

  const { userId, orgId } = auth();
  log("step=A auth", { ok: Boolean(userId), org: Boolean(orgId) });
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { q?: string; history?: HistoryTurn[] };
  try {
    body = await request.json();
  } catch {
    log("step=B FAIL parse JSON body");
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = (body.q ?? "").trim().slice(0, 500);
  if (!query) {
    log("step=B FAIL empty q");
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  // Accept full history  buildAnalystPrompt handles compression internally
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history.filter((h): h is HistoryTurn => !!h.question && !!h.answer)
    : [];

  log("step=B body OK", { queryCharCount: query.length, historyTurns: history.length });

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) {
    log("step=C FAIL tenant not found", { userShort: userId.slice(0, 8) });
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  log("step=C tenant OK", { tenantShort: tenant.id.slice(0, 8) });

  // ── Fetch digests (pgvector semantic + keyword fallback) ───────────────────
  const topDigests = await selectDigestsForAnalyst(tenant.id, query, traceId);
  log("step=D digests selected", { count: topDigests.length });

  // ── Fetch transcripts ──────────────────────────────────────────────────────
  const sessions = await prisma.saveSession.findMany({
    where: { tenantId: tenant.id, triggerType: "cancel_attempt" },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      transcript: true,
      subscriptionMrr: true,
      offerType: true,
      offerAccepted: true,
      offerMade: true,
      savedValue: true,
    },
  });

  const transcriptSnippets = sessions
    .map(s => ({
      mrr: Number(s.subscriptionMrr),
      offerType: s.offerType,
      accepted: s.offerAccepted,
      offerMade: s.offerMade,
      savedValue: s.savedValue != null ? Number(s.savedValue) : null,
      messages: extractUserMessages(s.transcript),
    }))
    .filter(s => s.messages.length > 0 || (s.offerMade != null && s.offerMade.trim().length > 0));

  log("step=E sessions loaded", {
    rawSessionRows: sessions.length,
    transcriptSnippetRows: transcriptSnippets.length,
  });

  // ── Generate AI answer ─────────────────────────────────────────────────────
  const model = getCancelAgentModel();

  if (!model) {
    log("step=F FAIL no LLM model (ANTHROPIC / AI not configured)");
    return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  }

  if (topDigests.length === 0 && transcriptSnippets.length === 0) {
    log("step=F early exit no digest and no transcript snippets");
    return NextResponse.json({
      answer: "No cancellation data yet. Run the feedback digest once you have cancel sessions, then come back and ask anything.",
      question: query,
    });
  }

  const prompt = buildAnalystPrompt(
    query,
    history,
    topDigests.map(d => ({
      digestText:      d.digestText,
      periodDays:      d.periodDays,
      transcriptCount: d.transcriptCount,
      createdAt:       d.createdAt,
    })),
    transcriptSnippets,
  );

  log("step=F generateText start", { promptCharCount: prompt.length });
  const tGen = Date.now();
  const result = await generateText({ model, prompt, maxOutputTokens: 200 });
  log("step=G generateText OK", { ms: Date.now() - tGen, answerCharCount: result.text?.length ?? 0 });

  return NextResponse.json({ answer: result.text.trim(), question: query, traceId });
}
