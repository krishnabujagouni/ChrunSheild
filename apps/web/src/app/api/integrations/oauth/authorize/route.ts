import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getIntegrationOAuthClient,
  INTEGRATION_OAUTH_SCOPE,
  isRedirectUriAllowed,
  validateIntegrationScopes,
} from "@/lib/integration-oauth-config";

function appOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return new URL(request.url).origin;
}

/**
 * OAuth2 authorization endpoint (automation tools). Redirects to sign-in or consent UI.
 * Query: response_type=code, client_id, redirect_uri, state, scope (optional, default webhooks:manage)
 */
export async function GET(request: Request) {
  const clientCfg = getIntegrationOAuthClient();
  if (!clientCfg) {
    return NextResponse.json({ error: "integration_oauth_not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  let scope = url.searchParams.get("scope")?.trim() || INTEGRATION_OAUTH_SCOPE;

  if (responseType !== "code" || !clientId || !redirectUri || !state) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "response_type=code, client_id, redirect_uri, and state are required" },
      { status: 400 }
    );
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

  const { userId } = auth();
  if (!userId) {
    const signIn = new URL("/sign-in", appOrigin(request));
    signIn.searchParams.set("redirect_url", url.toString());
    return NextResponse.redirect(signIn);
  }

  const consent = new URL("/dashboard/connections/oauth-consent", appOrigin(request));
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("scope", scope);
  consent.searchParams.set("state", state);
  return NextResponse.redirect(consent);
}
