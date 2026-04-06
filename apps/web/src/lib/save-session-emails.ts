import { Prisma, PrismaClientKnownRequestError } from "@prisma/client";
import { prisma } from "@/lib/db";

function subscriberEmailColumnMissing(e: unknown): boolean {
  if (!(e instanceof PrismaClientKnownRequestError) || e.code !== "P2010") return false;
  const blob = `${e.message}${e.meta?.message ?? ""}`;
  return blob.includes("subscriber_email") && (blob.includes("42703") || blob.includes("does not exist"));
}

/** Uses `subscriber_email` via raw SQL (works with stale Prisma Client). Run migrations so the column exists  see `prisma/migrations/20260329120000_subscriber_email`. */
export async function fetchLatestEmailBySubscriberId(tenantId: string): Promise<Record<string, string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ subscriber_id: string; subscriber_email: string }>>(
      Prisma.sql`
        SELECT DISTINCT ON (subscriber_id)
          subscriber_id,
          subscriber_email
        FROM save_sessions
        WHERE tenant_id = CAST(${tenantId} AS uuid)
          AND subscriber_email IS NOT NULL
          AND TRIM(subscriber_email) <> ''
        ORDER BY subscriber_id, created_at DESC
      `,
    );
    const out: Record<string, string> = {};
    for (const r of rows) {
      const em = r.subscriber_email?.trim();
      if (em) out[r.subscriber_id] = em;
    }
    return out;
  } catch (e) {
    if (subscriberEmailColumnMissing(e)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[ChurnShield] save_sessions.subscriber_email column missing  run: npx prisma migrate deploy",
        );
      }
      return {};
    }
    throw e;
  }
}

export async function fetchSubscriberEmailBySessionIds(
  sessionIds: string[],
): Promise<Record<string, string | null>> {
  if (sessionIds.length === 0) return {};
  try {
    const rows = await prisma.$queryRaw<Array<{ session_id: string; subscriber_email: string | null }>>(
      Prisma.sql`
        SELECT session_id::text AS session_id, subscriber_email
        FROM save_sessions
        WHERE session_id IN (${Prisma.join(sessionIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})
      `,
    );
    const out: Record<string, string | null> = Object.fromEntries(sessionIds.map((id) => [id, null]));
    for (const r of rows) {
      const em = r.subscriber_email?.trim();
      out[r.session_id] = em || null;
    }
    return out;
  } catch (e) {
    if (subscriberEmailColumnMissing(e)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[ChurnShield] save_sessions.subscriber_email column missing  run: npx prisma migrate deploy",
        );
      }
      return Object.fromEntries(sessionIds.map((id) => [id, null]));
    }
    throw e;
  }
}

export async function setSaveSessionSubscriberEmail(sessionId: string, email: string): Promise<void> {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE save_sessions
        SET subscriber_email = ${email}
        WHERE session_id = CAST(${sessionId} AS uuid)
      `,
    );
  } catch (e) {
    if (subscriberEmailColumnMissing(e)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[ChurnShield] save_sessions.subscriber_email column missing  email not stored; run: npx prisma migrate deploy",
        );
      }
      return;
    }
    throw e;
  }
}
