"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function runChurnPrediction(): Promise<{ ok: boolean; total_scored?: number; error?: string }> {
  const { userId, orgId } = auth();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) return { ok: false, error: "Tenant not found" };

  const agentsUrl = process.env.AGENTS_URL;
  if (!agentsUrl) return { ok: false, error: "AGENTS_URL not configured" };

  const res = await fetch(`${agentsUrl}/agents/churn-prediction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenant.id }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Agent returned ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json();
  revalidatePath("/dashboard/subscribers");
  return { ok: true, total_scored: data.total_scored };
}
