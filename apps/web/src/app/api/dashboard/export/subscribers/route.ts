import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchLatestEmailBySubscriberId } from "@/lib/save-session-emails";

export async function GET() {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const emailBySubscriberId = await fetchLatestEmailBySubscriberId(tenant.id);

  const [predictions, cancelCounts] = await Promise.all([
    prisma.churnPrediction.findMany({
      where: { tenantId: tenant.id },
      orderBy: { riskScore: "desc" },
    }),
    prisma.saveSession.groupBy({
      by: ["subscriberId"],
      where: { tenantId: tenant.id, triggerType: "cancel_attempt" },
      _count: { _all: true },
    }),
  ]);

  const cancelAttemptsMap = Object.fromEntries(
    cancelCounts.map((r) => [r.subscriberId, r._count._all])
  );
  const predictionBySub = Object.fromEntries(predictions.map((p) => [p.subscriberId, p]));
  const allIds = [...new Set([
    ...predictions.map((p) => p.subscriberId),
    ...cancelCounts.map((r) => r.subscriberId),
  ])];

  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const headers = [
    "Subscriber ID",
    "Email",
    "Risk Score",
    "Risk Class",
    "Cancel Attempts",
    "Failed Payments",
    "Days Inactive",
    "Last Scored",
  ];

  const lines = [
    headers.join(","),
    ...allIds.map((subscriberId) => {
      const p = predictionBySub[subscriberId];
      const features = (p?.features ?? {}) as Record<string, number>;
      return [
        subscriberId,
        emailBySubscriberId[subscriberId],
        p ? Math.round(Number(p.riskScore) * 100) : "",
        p?.riskClass ?? "",
        cancelAttemptsMap[subscriberId] ?? features.cancel_attempts ?? "",
        features.failed_payments ?? "",
        features.days_since_activity != null ? Math.round(features.days_since_activity) : "",
        p ? new Date(p.predictedAt).toISOString().slice(0, 10) : "",
      ]
        .map(escape)
        .join(",");
    }),
  ];

  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ChurnQ-subscribers-${date}.csv"`,
    },
  });
}
