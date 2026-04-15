import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { fetchLatestEmailBySubscriberId } from "@/lib/save-session-emails";
import { ExportSubscribersButton } from "./export-button";
import { RunPredictionButton } from "./run-prediction-button";
import { SubscribersTable, type SubscriberRow } from "./subscribers-table";

export default async function SubscribersPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) redirect("/dashboard");

  const emailBySubscriberId = await fetchLatestEmailBySubscriberId(tenant.id);

  const [predictions, cancelCountsBySubscriber] = await Promise.all([
    prisma.churnPrediction.findMany({
      where: { tenantId: tenant.id },
      orderBy: { riskScore: "desc" },
      take: 500,
    }),
    prisma.saveSession.groupBy({
      by: ["subscriberId"],
      where: { tenantId: tenant.id, triggerType: "cancel_attempt" },
      _count: { _all: true },
    }),
  ]);

  const cancelAttemptsMap = Object.fromEntries(
    cancelCountsBySubscriber.map((r) => [r.subscriberId, r._count._all]),
  );

  const predictionBySub = Object.fromEntries(predictions.map((p) => [p.subscriberId, p]));
  const sessionSubscriberIds = cancelCountsBySubscriber.map((r) => r.subscriberId);
  const mergedIds = [...new Set([...predictions.map((p) => p.subscriberId), ...sessionSubscriberIds])];

  type Row =
    | { kind: "scored"; subscriberId: string; prediction: (typeof predictions)[0] }
    | { kind: "session_only"; subscriberId: string };

  const rows: Row[] = mergedIds.map((subscriberId) => {
    const prediction = predictionBySub[subscriberId];
    return prediction
      ? { kind: "scored", subscriberId, prediction }
      : { kind: "session_only", subscriberId };
  });

  rows.sort((a, b) => {
    const pa = a.kind === "scored" ? a.prediction : null;
    const pb = b.kind === "scored" ? b.prediction : null;
    if (pa && pb) return Number(pb.riskScore) - Number(pa.riskScore);
    if (pa) return -1;
    if (pb) return 1;
    return a.subscriberId.localeCompare(b.subscriberId);
  });

  const tableRows = rows.slice(0, 500).map((row) => {
    const subscriberId = row.subscriberId;
    const displayEmail = emailBySubscriberId[subscriberId] ?? null;

    if (row.kind === "session_only") {
      return {
        subscriberId,
        displayEmail,
        riskScore: null,
        riskClass: null,
        cancelAttempts: cancelAttemptsMap[subscriberId] ?? "",
        failedPayments: "" as string | number,
        daysInactive: "" as string | number,
        lastScored: null,
      };
    }

    const p = row.prediction;
    const features = (p.features ?? {}) as Record<string, number>;
    const cancelAttempts = features.cancel_attempts ?? cancelAttemptsMap[subscriberId] ?? "";
    const failedPayments = features.failed_payments ?? "";
    const daysInactive = features.days_since_activity != null ? Math.round(features.days_since_activity) : "";

    return {
      subscriberId,
      displayEmail,
      riskScore: Number(p.riskScore),
      riskClass: p.riskClass,
      cancelAttempts,
      failedPayments,
      daysInactive,
      lastScored: p.predictedAt.toISOString(),
    };
  });

  return (
    <div>
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Subscriber Health</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Churn scores from the daily job · {predictions.length} scored · {mergedIds.length} with cancel activity
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <RunPredictionButton />
          <ExportSubscribersButton />
        </div>
      </div>

      <SubscribersTable rows={tableRows} />
    </div>
  );
}
