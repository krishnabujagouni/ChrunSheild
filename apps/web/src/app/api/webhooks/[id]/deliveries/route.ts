import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { WEBHOOK_LOG_RETENTION_DAYS, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS } from "@/lib/webhooks";

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, url: true },
  });

  if (!endpoint || endpoint.tenantId !== tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("status") ?? "all";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WEBHOOK_LOG_RETENTION_DAYS);

  const baseWhere = {
    webhookEndpointId: params.id,
    tenantId,
    createdAt: { gte: cutoff },
  };

  const statusFilter =
    tab === "delivered" ? { status: "delivered" as const } : tab === "failed" ? { status: "failed" as const } : {};

  const [items, totalCount, deliveredCount, failedCount] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { ...baseWhere, ...statusFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        event: true,
        status: true,
        httpStatus: true,
        errorMessage: true,
        responsePreview: true,
        payload: true,
        attempts: true,
        durationMs: true,
        isTest: true,
        createdAt: true,
      },
    }),
    prisma.webhookDelivery.count({ where: baseWhere }),
    prisma.webhookDelivery.count({ where: { ...baseWhere, status: "delivered" } }),
    prisma.webhookDelivery.count({ where: { ...baseWhere, status: "failed" } }),
  ]);

  return NextResponse.json({
    endpointUrl: endpoint.url,
    items: items.map(d => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    counts: { all: totalCount, delivered: deliveredCount, failed: failedCount },
    config: {
      timeoutSeconds: WEBHOOK_TIMEOUT_MS / 1000,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      retentionDays: WEBHOOK_LOG_RETENTION_DAYS,
    },
  });
}
