import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Vercel cron invokes this with a secret header — reject anything else.
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

  const { count } = await prisma.webhookDelivery.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  console.log(`[webhook-cleanup] deleted ${count} delivery rows older than 15 days`);
  return NextResponse.json({ ok: true, deleted: count });
}
