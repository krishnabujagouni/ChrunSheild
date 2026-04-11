import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BillingDashboard, type ChargeHistoryRow, type UnbilledRow } from "./billing-table";

async function getChargeHistory(tenantId: string): Promise<ChargeHistoryRow[]> {
  const grouped = await prisma.saveSession.groupBy({
    by: ["stripeChargeId"],
    where: {
      tenantId,
      stripeChargeId: { not: null },
      feeBilledAt:    { not: null },
      feeCharged:     { gt: 0 },
    },
    _sum:   { feeCharged: true },
    _count: { _all: true },
    _min:   { feeBilledAt: true },
  });

  const withRef = grouped
    .filter((g) => g.stripeChargeId && String(g.stripeChargeId).trim() !== "")
    .map((g) => ({
      id:             g.stripeChargeId!,
      stripeChargeId: g.stripeChargeId!,
      chargedAt:      g._min.feeBilledAt!.toISOString(),
      totalFee:       Number(g._sum.feeCharged ?? 0),
      saveCount:      g._count._all,
      isLegacy:       false as const,
    }));

  const legacySessions = await prisma.saveSession.findMany({
    where: {
      tenantId,
      feeBilledAt: { not: null },
      feeCharged:  { gt: 0 },
      OR: [
        { stripeChargeId: null },
        { stripeChargeId: "" },
      ],
    },
    select: {
      sessionId:   true,
      feeBilledAt: true,
      feeCharged:  true,
    },
  });

  const legacy: ChargeHistoryRow[] = legacySessions.map((s) => ({
    id:             `legacy:${s.sessionId}`,
    stripeChargeId: null,
    chargedAt:      s.feeBilledAt!.toISOString(),
    totalFee:       Number(s.feeCharged ?? 0),
    saveCount:      1,
    isLegacy:       true as const,
  }));

  return [...withRef, ...legacy].sort(
    (a, b) => new Date(b.chargedAt).getTime() - new Date(a.chargedAt).getTime(),
  );
}

async function getBillingData(tenantId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthAgg, unbilled, chargeHistory] = await Promise.all([
    prisma.saveSession.aggregate({
      where: {
        tenantId,
        feeBilledAt: { gte: startOfMonth },
        feeCharged:  { gt: 0 },
      },
      _sum: { feeCharged: true },
    }),
    prisma.saveSession.findMany({
      where: { tenantId, offerAccepted: true, feeBilledAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        sessionId: true, subscriberId: true, subscriberEmail: true,
        offerType: true, savedValue: true, feeCharged: true,
        createdAt: true, subscriptionMrr: true,
        outcomeConfirmedAt: true,
      },
    }),
    getChargeHistory(tenantId),
  ]);

  const billedThisMonth = Number(monthAgg._sum.feeCharged ?? 0);

  const queuedTotal = unbilled
    .filter((r) => r.outcomeConfirmedAt != null)
    .reduce((s, r) => s + Number(r.feeCharged ?? 0), 0);

  const confirmingCount = unbilled.filter((r) => r.outcomeConfirmedAt == null).length;

  const unbilledRows: UnbilledRow[] = unbilled.map((r) => {
    const feeNum = r.feeCharged != null ? Number(r.feeCharged) : 0;
    const hasFeeEstimate = feeNum > 0;

    if (r.outcomeConfirmedAt != null) {
      return {
        sessionId:       r.sessionId,
        subscriberId:    r.subscriberId,
        subscriberEmail: r.subscriberEmail ?? null,
        offerType:       r.offerType ?? null,
        mrrSaved:        Number(r.savedValue ?? r.subscriptionMrr),
        fee:             feeNum,
        status:          "queued",
        date:            r.outcomeConfirmedAt.toISOString(),
        sortTimestamp:   r.outcomeConfirmedAt.getTime(),
        sessionStartedAt: null,
      };
    }

    if (hasFeeEstimate) {
      return {
        sessionId:       r.sessionId,
        subscriberId:    r.subscriberId,
        subscriberEmail: r.subscriberEmail ?? null,
        offerType:       r.offerType ?? null,
        mrrSaved:        Number(r.savedValue ?? r.subscriptionMrr),
        fee:             feeNum,
        status:          "confirming",
        date:            null,
        sortTimestamp:   r.createdAt.getTime(),
        sessionStartedAt: r.createdAt.toISOString(),
      };
    }

    return {
      sessionId:       r.sessionId,
      subscriberId:    r.subscriberId,
      subscriberEmail: r.subscriberEmail ?? null,
      offerType:       r.offerType ?? null,
      mrrSaved:        null,
      fee:             null,
      status:          "confirming",
      date:            null,
      sortTimestamp:   r.createdAt.getTime(),
      sessionStartedAt: r.createdAt.toISOString(),
    };
  });

  return { chargeHistory, unbilledRows, billedThisMonth, queuedTotal, confirmingCount };
}

export default async function BillingPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId! } });

  if (!tenant) redirect("/dashboard");

  const { chargeHistory, unbilledRows, billedThisMonth, queuedTotal, confirmingCount } =
    await getBillingData(tenant.id);

  const hasActivity = chargeHistory.length > 0 || unbilledRows.length > 0;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Billing</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0", maxWidth: 720 }}>
          ChurnQ charges 15% of MRR retained per successful save. Where Stripe must confirm the
          outcome (e.g. discounted invoice paid), the fee is finalized after that event. All fees are
          collected in <strong>one monthly charge</strong> per workspace on the <strong>1st of the
          month (UTC)</strong>one Stripe payment per bill. Per-save detail stays in{" "}
          <a href="/dashboard/sessions" style={{ color: "#0f172a", fontWeight: 600 }}>
            Recent sessions
          </a>
          .
        </p>
      </div>

      {!tenant.stripeConnectId && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10,
          padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#92400e",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚠</span>
          <span>
            <strong>Stripe not connected.</strong>{" "}
            <a href="/dashboard/connections" style={{ color: "#92400e", fontWeight: 600 }}>
              Connect Stripe →
            </a>{" "}
            to enable automatic fee collection.
          </span>
        </div>
      )}

      <BillingDashboard
        chargeHistory={chargeHistory}
        unbilledRows={unbilledRows}
        billedThisMonth={billedThisMonth}
        queuedTotal={queuedTotal}
        confirmingCount={confirmingCount}
        hasActivity={hasActivity}
      />
    </div>
  );
}
