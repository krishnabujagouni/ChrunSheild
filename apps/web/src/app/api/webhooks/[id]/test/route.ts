import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { runWebhookTest } from "@/lib/webhooks";
import { checkRateLimit } from "@/lib/rate-limit";

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ep = await prisma.webhookEndpoint.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, url: true, secret: true, enabled: true },
  });

  if (!ep || ep.tenantId !== tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!ep.enabled) {
    return NextResponse.json({ error: "endpoint_disabled" }, { status: 400 });
  }

  const limited = await checkRateLimit("webhookTest", `${tenantId}:${params.id}`, () => ({}));
  if (limited) return limited;

  await runWebhookTest(ep);
  return NextResponse.json({ ok: true });
}
