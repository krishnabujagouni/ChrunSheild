import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

const OFFER_TYPES = ["discount", "pause", "extension", "downgrade", "empathy"] as const;

export async function GET(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const days = Number(req.nextUrl.searchParams.get("days") ?? 0);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
  const dateFilter = since ? { gte: since } : undefined;

  const baseWhere = {
    tenantId: tenant.id,
    triggerType: "cancel_attempt" as const,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const [allRows, savedRows] = await Promise.all([
    prisma.saveSession.groupBy({
      by: ["offerType"],
      where: baseWhere,
      _count: { _all: true },
      _sum: { savedValue: true, feeCharged: true, subscriptionMrr: true },
    }),
    prisma.saveSession.groupBy({
      by: ["offerType"],
      where: { ...baseWhere, offerAccepted: true },
      _count: { _all: true },
      _sum: { savedValue: true, feeCharged: true },
    }),
  ]);

  const savedMap = Object.fromEntries(
    savedRows.map((r) => [r.offerType ?? "__null__", r])
  );

  // Build one row per known offer type + null (no offer / cancelled immediately)
  const offerKeys = [...OFFER_TYPES, null] as (string | null)[];
  const rows = offerKeys.map((offerType) => {
    const key = offerType ?? "__null__";
    const all = allRows.find((r) => (r.offerType ?? "__null__") === key);
    const saved = savedMap[key];

    const attempts = all?._count._all ?? 0;
    const saves = saved?._count._all ?? 0;
    const saveRate = attempts > 0 ? Math.round((saves / attempts) * 1000) / 10 : 0;
    const totalMrrSaved = Number(saved?._sum.savedValue ?? 0);
    const totalFees = Number(saved?._sum.feeCharged ?? 0);
    const totalMrr = Number(all?._sum.subscriptionMrr ?? 0);
    const avgMrr = attempts > 0 ? Math.round((totalMrr / attempts) * 100) / 100 : 0;

    return {
      offerType,
      attempts,
      saves,
      saveRate,
      avgMrr,
      totalMrrSaved: Math.round(totalMrrSaved * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
    };
  }).filter((r) => r.attempts > 0);

  // Overall totals
  const totalAttempts = rows.reduce((s, r) => s + r.attempts, 0);
  const totalSaves = rows.reduce((s, r) => s + r.saves, 0);
  const overallSaveRate = totalAttempts > 0 ? Math.round((totalSaves / totalAttempts) * 1000) / 10 : 0;
  const bestOffer = rows
    .filter((r) => r.offerType !== null && r.attempts >= 3)
    .sort((a, b) => b.saveRate - a.saveRate)[0] ?? null;

  return NextResponse.json({
    rows,
    summary: { totalAttempts, totalSaves, overallSaveRate, bestOffer: bestOffer?.offerType ?? null },
  });
}
