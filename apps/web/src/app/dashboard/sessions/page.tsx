import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { fetchSubscriberEmailBySessionIds } from "@/lib/save-session-emails";
import { SessionsTable } from "./sessions-table";

async function getSessions(tenantId: string) {
  const rows = await prisma.saveSession.findMany({
    where: { tenantId, triggerType: "cancel_attempt" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      sessionId: true,
      subscriberId: true,
      subscriptionMrr: true,
      offerAccepted: true,
      offerMade: true,
      offerType: true,
      savedValue: true,
      createdAt: true,
    },
  });
  const emails = await fetchSubscriberEmailBySessionIds(rows.map((r) => r.sessionId));
  return rows.map((r) => ({
    ...r,
    subscriberEmail: emails[r.sessionId] ?? null,
  }));
}

export default async function SessionsPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId! } });

  if (!tenant) redirect("/dashboard");

  const sessions = await getSessions(tenant.id);
  const sessionsForClient = sessions.map((s) => ({
    sessionId: s.sessionId,
    subscriberId: s.subscriberId,
    subscriberEmail: s.subscriberEmail,
    subscriptionMrr: Number(s.subscriptionMrr),
    offerAccepted: s.offerAccepted,
    offerType: s.offerType,
    offerMade: s.offerMade,
    savedValue: s.savedValue != null ? Number(s.savedValue) : null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Recent Sessions</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          Up to {sessions.length} most recent cancel attempts loaded. Search and filters apply to this list.
        </p>
      </div>

      <SessionsTable sessions={sessionsForClient} />
    </>
  );
}
