import { NextResponse } from "next/server";
import {
  consumeAuthorizationCode,
  issueTokens,
  refreshAccessToken,
  verifyClientSecret,
} from "@/lib/integration-oauth";

function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    return { id: decoded.slice(0, i), secret: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

async function getClientCredentials(request: Request, body: URLSearchParams): Promise<{ id: string; secret: string } | null> {
  const basic = parseBasicAuth(request.headers.get("authorization"));
  if (basic?.id && basic.secret) return basic;
  const id = body.get("client_id")?.trim();
  const secret = body.get("client_secret")?.trim();
  if (id && secret) return { id, secret };
  return null;
}

/**
 * OAuth2 token endpoint (RFC 6749). grant_type=authorization_code | refresh_token
 */
export async function POST(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  let body: URLSearchParams;
  if (ct.includes("application/json")) {
    try {
      const j = (await request.json()) as Record<string, string>;
      body = new URLSearchParams(j);
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  } else {
    try {
      body = new URLSearchParams(await request.text());
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  }

  const creds = await getClientCredentials(request, body);
  if (!creds || !verifyClientSecret(creds.id, creds.secret)) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const grantType = body.get("grant_type");
  if (grantType === "authorization_code") {
    const code = body.get("code")?.trim();
    const redirectUri = body.get("redirect_uri")?.trim();
    if (!code || !redirectUri) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const consumed = await consumeAuthorizationCode(code, creds.id, redirectUri);
    if (!consumed) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    const tokens = await issueTokens({
      tenantId: consumed.tenantId,
      clientId: creds.id,
      scope: consumed.scope,
    });
    return NextResponse.json(tokens);
  }

  if (grantType === "refresh_token") {
    const refresh = body.get("refresh_token")?.trim();
    if (!refresh) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const tokens = await refreshAccessToken(refresh, creds.id);
    if (!tokens) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    return NextResponse.json(tokens);
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
