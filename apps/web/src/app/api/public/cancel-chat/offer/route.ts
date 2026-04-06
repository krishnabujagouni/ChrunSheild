import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId  = searchParams.get("sessionId");
  const snippetKey = searchParams.get("key");

  if (!sessionId || !snippetKey) {
    return NextResponse.json({ offer: null }, { headers: corsHeaders() });
  }

  const session = await prisma.saveSession.findUnique({
    where: { sessionId },
    select: { pendingOffer: true, tenant: { select: { snippetKey: true, embedAppId: true } } },
  });

  if (
    !session ||
    (session.tenant.snippetKey !== snippetKey && session.tenant.embedAppId !== snippetKey)
  ) {
    return NextResponse.json({ offer: null }, { headers: corsHeaders() });
  }

  return NextResponse.json({ offer: session.pendingOffer ?? null }, { headers: corsHeaders() });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
