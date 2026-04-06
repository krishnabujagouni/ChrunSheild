import { NextResponse } from "next/server";
import type { ModelMessage } from "ai";
import { checkRateLimit, MAX_ID_LEN } from "@/lib/rate-limit";
import { stepCountIs, streamText } from "ai";
import { Prisma } from "@prisma/client";
import {
  buildCancelAgentSystem,
  getCancelAgentModel,
  makeOfferTool,
  type MerchantOfferSettings,
  type PendingOffer,
} from "@/lib/cancel-agent";
import { prisma } from "@/lib/db";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";

export const maxDuration = 60;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const MAX_MESSAGES = 32;
const MAX_CONTENT_LEN = 12_000;

// Patterns that signal a prompt-injection attempt in user messages
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions/i,
  /disregard\s+(the\s+)?(above|previous|prior|system)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|an?\s+)/i,
  /new\s+system\s+prompt/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /\bjailbreak\b/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a\s+)/i,
  /override\s+(your\s+)?(instructions|rules|system)/i,
  /<\s*system\s*>/i,
  /\[INST\]/i,
];

// Patterns that look like injected system-level content inside a supposed assistant message
const FORGED_ASSISTANT_PATTERNS = [
  /system\s*:/i,
  /instructions\s*:/i,
  /ignore\s+(all\s+)?previous/i,
  /<\s*system\s*>/i,
];

function flagsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

function flagsForgery(text: string): boolean {
  return FORGED_ASSISTANT_PATTERNS.some((re) => re.test(text));
}

type ClientMsg = { role?: string; content?: unknown };

function parseMessages(raw: unknown): ModelMessage[] {
  if (!Array.isArray(raw)) {
    throw new Error("messages_must_be_array");
  }
  const slice = raw.slice(-MAX_MESSAGES);
  const out: ModelMessage[] = [];
  for (const item of slice) {
    if (!item || typeof item !== "object") continue;
    const m = item as ClientMsg;
    const role = m.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = String(m.content ?? "").trim();
    if (!content) continue;

    const truncated = content.slice(0, MAX_CONTENT_LEN);

    if (role === "user" && flagsInjection(truncated)) {
      // Replace the injected content with a safe placeholder so conversation continues
      // but the injection attempt is neutralised rather than silently dropped.
      out.push({ role: "user", content: "[message removed by security filter]" } as ModelMessage);
      continue;
    }

    if (role === "assistant" && flagsForgery(truncated)) {
      // Client is trying to forge an assistant message containing system-level directives  drop it.
      continue;
    }

    out.push({ role, content: truncated } as ModelMessage);
  }
  if (out.length === 0) {
    throw new Error("no_valid_messages");
  }
  const last = out[out.length - 1];
  if (last.role !== "user") {
    throw new Error("last_message_must_be_user");
  }
  return out;
}

type Body = {
  snippetKey?: string;
  appId?: string;
  sessionId?: string;
  messages?: unknown;
  locale?: string;
};

export async function POST(request: Request) {
  const model = getCancelAgentModel();
  if (!model) {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 503, headers: corsHeaders() });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  const embedPublicId = body.snippetKey?.trim() || body.appId?.trim();
  const sessionId  = body.sessionId?.trim()?.slice(0, MAX_ID_LEN);
  if (!embedPublicId || !sessionId) {
    return NextResponse.json(
      { error: "embed_key_and_sessionId_required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const limited = await checkRateLimit("cancelChat", `${embedPublicId}:${sessionId}`, corsHeaders);
  if (limited) return limited;

  let messages: ModelMessage[];
  try {
    messages = parseMessages(body.messages);
  } catch (e) {
    const code = e instanceof Error ? e.message : "invalid_messages";
    return NextResponse.json({ error: code }, { status: 400, headers: corsHeaders() });
  }

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 401, headers: corsHeaders() });
  }

  const session = await prisma.saveSession.findFirst({
    where: { sessionId, tenantId: tenant.id, triggerType: "cancel_attempt" },
  });
  if (!session) {
    return NextResponse.json({ error: "unknown_session" }, { status: 404, headers: corsHeaders() });
  }

  // Build personalised system prompt from subscriber context
  const [churnPrediction, pastAttempts] = await Promise.all([
    prisma.churnPrediction.findUnique({
      where: {
        tenantId_subscriberId: {
          tenantId: tenant.id,
          subscriberId: session.subscriberId,
        },
      },
    }),
    prisma.saveSession.count({
      where: {
        tenantId: tenant.id,
        subscriberId: session.subscriberId,
        triggerType: "cancel_attempt",
      },
    }),
  ]);

  // Sanitise locale to BCP-47 safe chars only (letters, digits, hyphens)  prevents injection
  const rawLocale = (body.locale ?? "").trim().slice(0, 20);
  const locale = /^[a-zA-Z0-9-]+$/.test(rawLocale) ? rawLocale : undefined;

  const systemPrompt = buildCancelAgentSystem({
    mrr: Number(session.subscriptionMrr),
    riskClass: churnPrediction?.riskClass ?? null,
    riskScore: churnPrediction ? Number(churnPrediction.riskScore) : null,
    cancelAttempts: pastAttempts,
    offerSettings: tenant.offerSettings as MerchantOfferSettings | null,
    locale,
  });

  const plainForTranscript = messages.map((m) => ({
    role: m.role,
    content: typeof (m as { content?: unknown }).content === "string" ? (m as { content: string }).content : "",
  }));

  const tools = { makeOffer: makeOfferTool };

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(2),
    maxOutputTokens: 1024,
    onFinish: async ({ text, steps }) => {
      let pendingFromTool: PendingOffer | undefined;
      for (const step of steps) {
        for (const tr of step.toolResults) {
          if (tr.type === "tool-result" && tr.toolName === "makeOffer") {
            const out = tr.output;
            if (out && typeof out === "object" && !Array.isArray(out)) {
              pendingFromTool = out as PendingOffer;
            }
          }
        }
      }

      const transcript = {
        v: 1 as const,
        updatedAt: new Date().toISOString(),
        messages: [...plainForTranscript, { role: "assistant" as const, content: text }],
      };

      await prisma.saveSession.update({
        where: { sessionId },
        data: {
          transcript: transcript as Prisma.InputJsonValue,
          ...(pendingFromTool !== undefined
            ? { pendingOffer: pendingFromTool as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
    },
  });

  return result.toTextStreamResponse({ headers: corsHeaders() });
}
