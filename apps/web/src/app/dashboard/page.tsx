import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SaveRateChart, MrrSavedChart, RiskChart } from "./charts";

async function getChartData(tenantId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [dailySessions, riskCounts] = await Promise.all([
    prisma.saveSession.findMany({
      where: { tenantId, triggerType: "cancel_attempt", createdAt: { gte: thirtyDaysAgo } },
      select: { offerAccepted: true, savedValue: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.churnPrediction.groupBy({
      by: ["riskClass"],
      where: { tenantId },
      _count: { riskClass: true },
    }),
  ]);

  // Aggregate by day
  const byDay: Record<string, { saved: number; cancelled: number; mrr: number }> = {};
  for (const s of dailySessions) {
    const day = s.createdAt.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { saved: 0, cancelled: 0, mrr: 0 };
    if (s.offerAccepted) {
      byDay[day].saved++;
      byDay[day].mrr += Number(s.savedValue ?? 0);
    } else {
      byDay[day].cancelled++;
    }
  }
  const dailyPoints = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5), // MM-DD
      ...v,
      mrr: Math.round(v.mrr * 100) / 100,
    }));

  const riskPoints = ["high", "medium", "low"].map((cls) => ({
    class: cls,
    count: riskCounts.find((r) => r.riskClass === cls)?._count.riskClass ?? 0,
  }));

  return { dailyPoints, riskPoints };
}

async function getMetrics(tenantId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sessions, allTimeSaved, highRisk, pendingRetries] =
    await Promise.all([
      prisma.saveSession.findMany({
        where: { tenantId, triggerType: "cancel_attempt", createdAt: { gte: monthStart } },
        select: { offerAccepted: true, savedValue: true, feeCharged: true },
      }),
      prisma.saveSession.aggregate({
        where: { tenantId, offerAccepted: true },
        _sum: { savedValue: true, feeCharged: true },
      }),
      prisma.churnPrediction.count({ where: { tenantId, riskClass: "high" } }),
      prisma.paymentRetry.count({ where: { tenantId, status: "pending" } }),
    ]);

  const total = sessions.length;
  const saved = sessions.filter((s) => s.offerAccepted).length;
  const saveRate = total > 0 ? Math.round((saved / total) * 1000) / 10 : 0;
  const monthSavedValue = sessions.reduce((a, s) => a + Number(s.savedValue ?? 0), 0);
  const monthFees = sessions.reduce((a, s) => a + Number(s.feeCharged ?? 0), 0);

  return {
    month: { total, saved, saveRate, savedValue: monthSavedValue, fees: monthFees },
    allTime: {
      savedValue: Number(allTimeSaved._sum.savedValue ?? 0),
      fees: Number(allTimeSaved._sum.feeCharged ?? 0),
    },
    highRisk,
    pendingRetries,
  };
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--cs-surface, #fff)",
      border: "1px solid var(--cs-border, #e4e4e7)",
      borderRadius: 14,
      padding: "20px 22px",
      flex: 1,
      minWidth: 180,
      boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(24,24,27,0.05))",
    }}>
      <div style={{ fontSize: 11, color: "var(--cs-text-muted, #71717a)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: accent ?? "var(--cs-text, #18181b)", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}


export default async function DashboardPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  // Look up tenant: org → user → dev fallback
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : userId
    ? await prisma.tenant.findUnique({ where: { clerkUserId: userId } })
    : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });

  if (!tenant) {
    // Auto-create tenant  fetch name + email from Clerk
    const clerkUser = await clerkClient.users.getUser(userId!);
    const email = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? null;
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      email?.split("@")[0] ||
      "My Workspace";

    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let snippetKey = "cs_live_";
    for (let i = 0; i < 24; i++) snippetKey += chars[Math.floor(Math.random() * chars.length)];

    const { generateEmbedAppId, generateEmbedHmacSecret } = await import("@/lib/tenant-embed");
    await prisma.tenant.create({
      data: {
        name,
        clerkUserId: userId!,
        ownerEmail: email,
        snippetKey,
        embedAppId: generateEmbedAppId(),
        embedHmacSecret: generateEmbedHmacSecret(),
      },
    });
    redirect("/dashboard");
    return null;
  }

  // Backfill ownerEmail if missing (accounts created before this field existed)
  if (!tenant.ownerEmail && userId) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const email = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ?? null;
      if (email) await prisma.tenant.update({ where: { id: tenant.id }, data: { ownerEmail: email } });
    } catch { /* non-blocking */ }
  }

  const [m, charts] = await Promise.all([
    getMetrics(tenant.id),
    getChartData(tenant.id),
  ]);

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--cs-text, #18181b)", letterSpacing: "-0.02em" }}>Overview</h1>
        <p style={{ color: "var(--cs-text-muted, #71717a)", fontSize: 13, margin: "6px 0 0" }}>
          This month · {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Setup prompt  only if not yet integrated */}
      {!tenant.embedSecretActivated && (
        <div style={{
          background: "linear-gradient(135deg, #1c1917 0%, #09090b 100%)",
          border: "1px solid #27272a",
          borderRadius: 14, padding: "18px 22px", marginBottom: 24,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(0,0,0,0.2))",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa", marginBottom: 4 }}>
              ChurnQ is not connected to your app yet
            </div>
            <div style={{ fontSize: 12, color: "#a1a1aa" }}>
              Follow the 4-step guide to start intercepting cancel clicks and saving subscribers.
            </div>
          </div>
          <a href="/dashboard/integration" style={{
            background: "var(--cs-accent, #6d28d9)", color: "#fff", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 600,
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            View integration guide →
          </a>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <Card label="Save Rate" value={`${m.month.saveRate}%`} sub={`${m.month.saved} of ${m.month.total} sessions`} accent="#2563eb" />
        <Card label="MRR Saved" value={`$${m.month.savedValue.toFixed(2)}`} sub="This month" />
        <Card label="Fees Earned" value={`$${m.month.fees.toFixed(2)}`} sub={`All-time: $${m.allTime.fees.toFixed(2)}`} />
        <a href="/dashboard/subscribers" style={{ flex: 1, minWidth: 180, textDecoration: "none" }}>
          <Card label="High-Risk Users" value={String(m.highRisk)} sub={`${m.pendingRetries} payment retries pending · view all →`} accent={m.highRisk > 0 ? "#dc2626" : undefined} />
        </a>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Save Rate  Last 30 Days",      chart: <SaveRateChart data={charts.dailyPoints} />, accent: "#9152EE" },
          { title: "MRR Saved  Last 30 Days",      chart: <MrrSavedChart data={charts.dailyPoints} />, accent: "#40E5D1" },
          { title: "Churn Risk Distribution",        chart: <RiskChart data={charts.riskPoints} />,      accent: "#4C86FF" },
        ].map(({ title, chart, accent }) => (
          <div key={title} style={{
            background: "linear-gradient(165deg, #18181b 0%, #0a0a0a 100%)",
            border: "1px solid #27272a",
            borderRadius: 14, padding: "20px 22px",
            boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(0,0,0,0.3))",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{title}</h2>
            </div>
            {chart}
          </div>
        ))}
      </div>


    </>
  );
}
