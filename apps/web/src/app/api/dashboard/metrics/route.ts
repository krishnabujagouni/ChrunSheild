import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fetchSubscriberEmailBySessionIds } from "@/lib/save-session-emails";

export async function GET() {
  const { orgId, userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sessions, allTime, highRisk, pendingRetries, latestDigest] = await Promise.all([
    // This month's sessions
    prisma.saveSession.findMany({
      where: { tenantId: tenant.id, triggerType: "cancel_attempt", createdAt: { gte: monthStart } },
      select: { offerAccepted: true, savedValue: true, feeCharged: true },
    }),
    // All-time totals
    prisma.saveSession.aggregate({
      where: { tenantId: tenant.id, offerAccepted: true },
      _sum: { savedValue: true, feeCharged: true },
    }),
    // High-risk count
    prisma.churnPrediction.count({
      where: { tenantId: tenant.id, riskClass: "high" },
    }),
    // Pending retries
    prisma.paymentRetry.count({
      where: { tenantId: tenant.id, status: "pending" },
    }),
    // Latest feedback digest
    prisma.feedbackDigest.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { digestText: true, createdAt: true, transcriptCount: true },
    }),
  ]);

  const total = sessions.length;
  const saved = sessions.filter((s) => s.offerAccepted).length;
  const saveRate = total > 0 ? Math.round((saved / total) * 1000) / 10 : 0;
  const monthSavedValue = sessions.reduce((acc, s) => acc + Number(s.savedValue ?? 0), 0);
  const monthFees = sessions.reduce((acc, s) => acc + Number(s.feeCharged ?? 0), 0);

  // Recent sessions for table
  const recentSessions = await prisma.saveSession.findMany({
    where: { tenantId: tenant.id, triggerType: "cancel_attempt" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      sessionId: true,
      subscriberId: true,
      subscriptionMrr: true,
      offerAccepted: true,
      offerMade: true,
      savedValue: true,
      createdAt: true,
    },
  });
  const recentEmails = await fetchSubscriberEmailBySessionIds(recentSessions.map((s) => s.sessionId));

  return NextResponse.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    month: {
      total,
      saved,
      saveRate,
      savedValue: Math.round(monthSavedValue * 100) / 100,
      fees: Math.round(monthFees * 100) / 100,
    },
    allTime: {
      savedValue: Number(allTime._sum.savedValue ?? 0),
      fees: Number(allTime._sum.feeCharged ?? 0),
    },
    highRiskCount: highRisk,
    pendingRetries,
    latestDigest,
    recentSessions: recentSessions.map((s) => ({
      ...s,
      subscriberEmail: recentEmails[s.sessionId] ?? null,
      subscriptionMrr: Number(s.subscriptionMrr),
      savedValue: Number(s.savedValue ?? 0),
    })),
  });
}
