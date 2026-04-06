import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!endpoint || endpoint.tenantId !== tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { enabled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const updated = await prisma.webhookEndpoint.update({
    where: { id: params.id },
    data: { ...(typeof body.enabled === "boolean" && { enabled: body.enabled }) },
    select: { id: true, enabled: true },
  });
  return NextResponse.json({ endpoint: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });

  if (!endpoint || endpoint.tenantId !== tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.webhookEndpoint.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
