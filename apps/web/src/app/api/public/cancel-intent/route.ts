import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, MAX_ID_LEN, MAX_MRR } from "@/lib/rate-limit";
import { verifyEmbedAuthHash } from "@/lib/embed-auth";
import { setSaveSessionSubscriberEmail } from "@/lib/save-session-emails";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";
import {
  normalizeStripeSubscriptionId,
  normalizeSubscriberEmail,
} from "@/lib/subscriber-stripe";

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

type Body = {
  /** Public tenant id: cs_live_... (snippet key) or cs_app_... (app id) */
  snippetKey?: string;
  /** Alias for snippetKey  same value as data-app-id */
  appId?: string;
  subscriberId?: string;
  /** HMAC-SHA256(embed secret, subscriberId) hex  always required */
  authHash?: string;
  /** Optional  shown in merchant dashboard instead of raw cus_ id */
  subscriberEmail?: string;
  /** Optional  Stripe sub_...; retention offers apply to this subscription */
  subscriptionId?: string;
  stripeSubscriptionId?: string;
  subscriptionMrr?: number | string;
  /** Optional  Stripe prod_...; stored for per-product filtering */
  stripeProductId?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  const embedPublicId = body.snippetKey?.trim() || body.appId?.trim();
  const subscriberId = body.subscriberId?.trim()?.slice(0, MAX_ID_LEN);
  if (!embedPublicId || !subscriberId) {
    return NextResponse.json(
      {
        error: "embed_key_and_subscriberId_required",
        hint: "Pass snippetKey or appId (from data-key or data-app-id) plus subscriberId.",
      },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Accept any non-empty subscriber id  tenants may use internal ids, not just cus_...
  // Stripe customer id format is only required when actually calling Stripe (cancel-outcome).
  if (subscriberId.length > MAX_ID_LEN) {
    return NextResponse.json(
      { error: "subscriber_id_too_long", hint: `subscriberId must be ≤ ${MAX_ID_LEN} characters.` },
      { status: 400, headers: corsHeaders() },
    );
  }

  const limited = await checkRateLimit("cancelIntent", `${embedPublicId}:${subscriberId}`, corsHeaders);
  if (limited) return limited;

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 401, headers: corsHeaders() });
  }

  const secret = tenant.embedHmacSecret.trim();
  if (!secret) {
    return NextResponse.json({ error: "embed_signing_misconfigured" }, { status: 503, headers: corsHeaders() });
  }

  const hash = body.authHash?.trim();
  const activated = tenant.embedSecretActivated;

  if (hash) {
    // Hash provided  always verify regardless of activation state
    if (!verifyEmbedAuthHash(secret, subscriberId, hash)) {
      return NextResponse.json(
        { error: "invalid_auth_hash", hint: "Hash must be lowercase hex(64) of HMAC-SHA256(secret, subscriberId)." },
        { status: 401, headers: corsHeaders() },
      );
    }
  } else if (activated) {
    // Secret activated but no hash supplied → reject
    return NextResponse.json(
      {
        error: "auth_hash_required",
        hint:
          "HMAC is required. Compute hex(64) HMAC-SHA256(ChurnQ_EMBED_SECRET, subscriberId) and pass authHash, or use identify({ getAuthHash }) in cs.js.",
      },
      { status: 401, headers: corsHeaders() },
    );
  }
  // else: grace mode  secret not yet activated, no hash supplied. Allow through with warning header.

  const rawStripeSub = body.subscriptionId ?? body.stripeSubscriptionId;
  const stripeSubscriptionId = normalizeStripeSubscriptionId(rawStripeSub);
  if (rawStripeSub != null && String(rawStripeSub).trim() !== "" && !stripeSubscriptionId) {
    return NextResponse.json(
      { error: "invalid_subscription_id", hint: "Expected Stripe subscription id sub_..." },
      { status: 400, headers: corsHeaders() },
    );
  }

  const mrrRaw = body.subscriptionMrr ?? 0;
  const subscriptionMrr = Math.min(
    Math.max(0, typeof mrrRaw === "number" && Number.isFinite(mrrRaw) ? mrrRaw : Number.parseFloat(String(mrrRaw)) || 0),
    MAX_MRR,
  );

  const subscriberEmail = normalizeSubscriberEmail(body.subscriberEmail);

  const rawProductId = body.stripeProductId?.trim();
  const stripeProductId = rawProductId && /^prod_/.test(rawProductId) ? rawProductId.slice(0, 64) : undefined;

  const session = await prisma.saveSession.create({
    data: {
      tenantId: tenant.id,
      triggerType: "cancel_attempt",
      subscriberId,
      subscriptionMrr,
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      ...(stripeProductId ? { stripeProductId } : {}),
    },
  });

  if (subscriberEmail) {
    await setSaveSessionSubscriberEmail(session.sessionId, subscriberEmail);
  }

  const responseHeaders: HeadersInit = { ...corsHeaders() };
  if (!activated) {
    (responseHeaders as Record<string, string>)["X-ChurnQ-Warning"] = "embed_unsigned";
  }

  return NextResponse.json(
    {
      sessionId: session.sessionId,
      tenantId: tenant.id,
      ...(!activated ? { warning: "embed_unsigned", hint: "Add server signing (HMAC authHash) and rotate your embed secret to secure this endpoint." } : {}),
    },
    { headers: responseHeaders },
  );
}
