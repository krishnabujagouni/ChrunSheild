import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Removes the Slack webhook connection for the authenticated merchant. */
export async function POST() {
  const { userId, orgId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const where = orgId ? { clerkOrgId: orgId } : { clerkUserId: userId };
  try {
    await prisma.tenant.update({
      where,
      data: { slackWebhookUrl: null, slackChannelName: null },
    });
  } catch {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
