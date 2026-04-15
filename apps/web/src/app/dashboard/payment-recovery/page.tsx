import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RecoveryTable, type RecoveryRow } from "./recovery-table";

async function getRecoveryData(tenantId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [rows, kpis] = await Promise.all([
    prisma.paymentRetry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.paymentRetry.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { status: true },
    }),
  ]);

  // Likely recovered = had at least 1 attempt, no last error, not exhausted, updated in last 7 days
  const likelyRecovered = rows.filter(
    (r) =>
      r.attempts > 0 &&
      !r.lastError &&
      r.status !== "exhausted" &&
      r.updatedAt >= sevenDaysAgo,
  ).length;

  const kpiMap: Record<string, number> = {};
  for (const g of kpis) {
    kpiMap[g.status] = g._count.status;
  }

  return {
    rows: rows.map((r): RecoveryRow => ({
      id:           r.id,
      customerEmail: r.customerEmail,
      customerId:   r.customerId,
      failureClass: r.failureClass,
      attempts:     r.attempts,
      maxAttempts:  r.maxAttempts,
      status:       r.status,
      nextRetryAt:  r.nextRetryAt?.toISOString() ?? null,
      lastError:    r.lastError,
      createdAt:    r.createdAt.toISOString(),
    })),
    kpis: {
      active:         kpiMap["pending"] ?? 0,
      exhausted:      kpiMap["exhausted"] ?? 0,
      likelyRecovered,
    },
  };
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: "var(--cs-surface, #fff)",
      border: "1px solid var(--cs-border, #e4e4e7)",
      borderRadius: 14,
      padding: "20px 22px",
      flex: 1,
      minWidth: 160,
      boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(24,24,27,0.05))",
    }}>
      <div style={{ fontSize: 11, color: "var(--cs-text-muted, #71717a)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, letterSpacing: "-0.02em", color: accent ?? "var(--cs-text, #18181b)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default async function PaymentRecoveryPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId! } });

  if (!tenant) redirect("/dashboard");

  const { rows, kpis } = await getRecoveryData(tenant.id);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>
          Payment Recovery
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0", maxWidth: 680 }}>
          When a subscriber&apos;s payment fails, ChurnQ automatically retries it and sends them a
          personalised email  no action needed from you. You&apos;ll get a summary every Monday morning.
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
        <KpiCard
          label="Total tracked"
          value={rows.length}
          sub="failed invoices handled"
        />
        <KpiCard
          label="Being retried"
          value={kpis.active}
          sub="waiting on next attempt"
          accent={kpis.active > 0 ? "#d97706" : undefined}
        />
        <KpiCard
          label="Likely recovered"
          value={kpis.likelyRecovered}
          sub="retried successfully this week"
          accent={kpis.likelyRecovered > 0 ? "#16a34a" : undefined}
        />
        <KpiCard
          label="Gave up"
          value={kpis.exhausted}
          sub="all retries used up"
          accent={kpis.exhausted > 0 ? "#dc2626" : undefined}
        />
      </div>

      <RecoveryTable rows={rows} />
    </div>
  );
}
