import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { generateWebhookSecret } from "@/lib/webhooks";

const VALID_EVENTS = ["save.created", "high_risk.detected"];

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, events: true, secret: true, enabled: true, label: true, createdAt: true },
  });

  return NextResponse.json({ endpoints });
}

export async function POST(request: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { url?: string; events?: string[]; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const url = body.url?.trim().replace(/\s+/g, "");
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return NextResponse.json({ error: "url must be a valid http/https URL" }, { status: 400 });
  }

  const events = (body.events ?? []).filter((e: string) => VALID_EVENTS.includes(e));
  if (events.length === 0) {
    return NextResponse.json({ error: "select at least one event" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.slice(0, 32) : null;

  const count = await prisma.webhookEndpoint.count({ where: { tenantId } });
  if (count >= 10) {
    return NextResponse.json({ error: "max 10 endpoints per tenant" }, { status: 400 });
  }

  const endpoint = await prisma.webhookEndpoint.create({
    data: { tenantId, url, events, secret: generateWebhookSecret(), ...(label && { label }) },
    select: { id: true, url: true, events: true, secret: true, enabled: true, label: true, createdAt: true },
  });

  return NextResponse.json({ endpoint }, { status: 201 });
}
