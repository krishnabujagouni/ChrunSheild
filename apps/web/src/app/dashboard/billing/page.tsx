import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BillingTable, type BillingRow } from "./billing-table";

async function getBillingData(tenantId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [billed, pending] = await Promise.all([
    prisma.saveSession.findMany({
      where: { tenantId, offerAccepted: true, feeBilledAt: { gte: startOfMonth } },
      orderBy: { feeBilledAt: "desc" },
      select: {
        sessionId: true, subscriberId: true, subscriberEmail: true,
        offerType: true, savedValue: true, feeCharged: true,
        feeBilledAt: true, stripeChargeId: true, subscriptionMrr: true,
      },
    }),
    prisma.saveSession.findMany({
      where: { tenantId, offerAccepted: true, feeBilledAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        sessionId: true, subscriberId: true, subscriberEmail: true,
        offerType: true, savedValue: true, feeCharged: true,
        createdAt: true, subscriptionMrr: true,
      },
    }),
  ]);

  const billedThisMonth = billed.reduce((s, r) => s + Number(r.feeCharged ?? 0), 0);
  const pendingTotal    = pending.reduce((s, r) => s + Number(r.feeCharged ?? 0), 0);

  const rows: BillingRow[] = [
    ...billed.map(r => ({
      sessionId:      r.sessionId,
      subscriberId:   r.subscriberId,
      subscriberEmail: r.subscriberEmail ?? null,
      offerType:      r.offerType ?? null,
      mrrSaved:       Number(r.savedValue ?? r.subscriptionMrr),
      fee:            Number(r.feeCharged ?? 0),
      status:         "billed" as const,
      date:           r.feeBilledAt!.toISOString(),
      stripeChargeId: r.stripeChargeId ?? null,
    })),
    ...pending.map(r => ({
      sessionId:      r.sessionId,
      subscriberId:   r.subscriberId,
      subscriberEmail: r.subscriberEmail ?? null,
      offerType:      r.offerType ?? null,
      mrrSaved:       Number(r.savedValue ?? r.subscriptionMrr),
      fee:            Number(r.feeCharged ?? 0),
      status:         "pending" as const,
      date:           r.createdAt.toISOString(),
      stripeChargeId: null,
    })),
  ];

  return { rows, billedThisMonth, pendingTotal };
}

export default async function BillingPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId! } });

  if (!tenant) redirect("/dashboard");

  const { rows, billedThisMonth, pendingTotal } = await getBillingData(tenant.id);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Billing</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          ChurnShield charges 15% of MRR retained per successful save — you only pay when it works.
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

      <BillingTable
        rows={rows}
        billedThisMonth={billedThisMonth}
        pendingTotal={pendingTotal}
      />
    </div>
  );
}
