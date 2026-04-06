import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";
import { checkRateLimit, MAX_ID_LEN, MAX_MRR } from "@/lib/rate-limit";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

type Body = {
  snippetKey?: string;
  appId?: string;
  subscriberId?: string;
  subscriptionMrr?: number;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  const embedPublicId   = body.snippetKey?.trim() || body.appId?.trim();
  const subscriberId    = body.subscriberId?.trim()?.slice(0, MAX_ID_LEN);
  const subscriptionMrr = Math.min(Math.max(0, Number(body.subscriptionMrr ?? 0)), MAX_MRR);

  if (!embedPublicId || !subscriberId) {
    return NextResponse.json(
      { error: "snippetKey (or appId) and subscriberId are required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const limited = await checkRateLimit("pause", `${embedPublicId}:${subscriberId}`, corsHeaders);
  if (limited) return limited;

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 401, headers: corsHeaders() });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500, headers: corsHeaders() });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });

  // Find the active subscription for this customer
  const subscriptions = await stripe.subscriptions.list({
    customer: subscriberId,
    status: "active",
    limit: 1,
  });

  if (!subscriptions.data.length) {
    return NextResponse.json({ error: "no_active_subscription" }, { status: 404, headers: corsHeaders() });
  }

  const sub = subscriptions.data[0];

  // Pause billing  mark_uncollectible keeps subscription active but stops charges
  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "mark_uncollectible" },
  });

  // Record as a save session (pause = save attempt, 30-day billing sweep confirms)
  await prisma.saveSession.create({
    data: {
      tenantId:          tenant.id,
      triggerType:       "cancel_attempt",
      subscriberId,
      subscriptionMrr,
      offerMade:         "pause_wall",
      offerAccepted:     true,
      outcomeConfirmedAt: new Date(),
    },
  });

  // Mark pause wall as active on this subscriber
  await prisma.subscriberFlag.upsert({
    where:  { tenantId_subscriberId: { tenantId: tenant.id, subscriberId } },
    create: { tenantId: tenant.id, subscriberId, pauseWallActive: true },
    update: { pauseWallActive: true },
  });

  return NextResponse.json(
    { ok: true, paused: true, subscriptionId: sub.id },
    { headers: corsHeaders() },
  );
}
