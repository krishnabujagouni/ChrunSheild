/**
 * DEV-ONLY endpoint  returns HMAC-SHA256(embedHmacSecret, subscriberId) for local testing.
 * Not available in production (returns 404). No auth required  localhost only.
 * Looks up tenant by snippetKey so the test page doesn't need Clerk session cookies.
 * Used by test-app/index.html via authHashUrl so cancel-intent authHash check passes in dev.
 */
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_available_in_production" }, { status: 404 });
  }

  let body: { subscriberId?: string; snippetKey?: string; appId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  const subscriberId = (body.subscriberId ?? "").trim();
  const embedPublicId = (body.snippetKey ?? body.appId ?? "").trim();

  if (!subscriberId || !embedPublicId) {
    return NextResponse.json(
      { error: "subscriberId_and_snippetKey_required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 404, headers: corsHeaders() });
  }

  const secret = tenant.embedHmacSecret?.trim();
  if (!secret) {
    return NextResponse.json({ error: "embed_secret_not_set" }, { status: 503, headers: corsHeaders() });
  }

  const authHash = createHmac("sha256", secret).update(subscriberId).digest("hex");
  return NextResponse.json({ authHash }, { headers: corsHeaders() });
}
