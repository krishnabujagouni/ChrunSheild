import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";
import { checkRateLimit, MAX_ID_LEN } from "@/lib/rate-limit";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const embedPublicId =
    searchParams.get("snippetKey")?.trim() ||
    searchParams.get("appId")?.trim();
  const subscriberId = searchParams.get("subscriberId")?.trim()?.slice(0, MAX_ID_LEN);

  if (!embedPublicId || !subscriberId) {
    return NextResponse.json(
      { error: "snippetKey (or appId) and subscriberId are required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const limited = await checkRateLimit("subscriberStatus", `${embedPublicId}:${subscriberId}`, corsHeaders);
  if (limited) return limited;

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 401, headers: corsHeaders() });
  }

  const flag = await prisma.subscriberFlag.findUnique({
    where: { tenantId_subscriberId: { tenantId: tenant.id, subscriberId } },
  });

  return NextResponse.json(
    {
      paymentWallActive: flag?.paymentWallActive ?? false,
      pauseWallActive:   flag?.pauseWallActive   ?? false,
    },
    { headers: corsHeaders() },
  );
}
