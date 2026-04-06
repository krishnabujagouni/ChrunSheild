import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

/** Whether embed signing is enabled (no secret exposed). */
export async function GET() {
  try {
    const { userId, orgId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
  const tenant = orgId
    ? await prisma.tenant.findUnique({
        where: { clerkOrgId: orgId },
        select: { embedAppId: true, snippetKey: true },
      })
    : await prisma.tenant.findUnique({
        where: { clerkUserId: userId },
        select: { embedAppId: true, snippetKey: true },
      });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    enabled: true,
    appId: tenant.embedAppId,
    snippetKey: tenant.snippetKey,
  });
  } catch (e) {
    console.error("[embed-hmac GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** Generate a new secret and return it once (store server-side only on the merchant app). */
export async function POST() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const secret = randomBytes(32).toString("hex");
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { embedHmacSecret: secret, embedSecretActivated: true },
    });
    return NextResponse.json({ secret });
  } catch (e) {
    console.error("[embed-hmac POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: "embed_signing_always_required", hint: "Rotate the secret instead of clearing it." },
    { status: 400 },
  );
}
