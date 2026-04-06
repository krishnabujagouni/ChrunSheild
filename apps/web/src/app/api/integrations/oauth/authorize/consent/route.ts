import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
  getIntegrationOAuthClient,
  isRedirectUriAllowed,
  validateIntegrationScopes,
} from "@/lib/integration-oauth-config";
import { createAuthorizationCode } from "@/lib/integration-oauth";

async function getTenantId(): Promise<string | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;
  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, select: { id: true } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  return tenant?.id ?? null;
}

type Body = {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
};

/** Called from the consent screen after the tenant approves access. */
export async function POST(request: Request) {
  const clientCfg = getIntegrationOAuthClient();
  if (!clientCfg) {
    return NextResponse.json({ error: "integration_oauth_not_configured" }, { status: 503 });
  }

  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const clientId = body.client_id?.trim();
  const redirectUri = body.redirect_uri?.trim();
  const state = body.state;
  const scope = body.scope?.trim() || "";

  if (!clientId || !redirectUri || state == null || state === "") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (clientId !== clientCfg.clientId) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  if (!isRedirectUriAllowed(redirectUri, clientCfg.redirectUris)) {
    return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri is not allowed" }, { status: 400 });
  }

  if (!validateIntegrationScopes(scope)) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  const code = await createAuthorizationCode({
    tenantId,
    clientId,
    redirectUri,
    scope,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", state);
  return NextResponse.json({ redirect_to: redirect.toString() });
}
