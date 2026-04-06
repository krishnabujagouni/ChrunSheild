import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getIntegrationOAuthClient } from "@/lib/integration-oauth-config";

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyClientSecret(clientId: string, clientSecret: string): boolean {
  const c = getIntegrationOAuthClient();
  if (!c || c.clientId !== clientId) return false;
  return timingSafeStringEqual(clientSecret, c.clientSecret);
}

export async function createAuthorizationCode(input: {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const codeHash = hashToken(raw);
  await prisma.integrationOAuthAuthCode.create({
    data: {
      tenantId: input.tenantId,
      codeHash,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return raw;
}

export async function consumeAuthorizationCode(
  rawCode: string,
  clientId: string,
  redirectUri: string
): Promise<{ tenantId: string; scope: string } | null> {
  const codeHash = hashToken(rawCode);
  const row = await prisma.integrationOAuthAuthCode.findUnique({ where: { codeHash } });
  if (
    !row ||
    row.usedAt != null ||
    row.expiresAt < new Date() ||
    row.clientId !== clientId ||
    row.redirectUri !== redirectUri
  ) {
    return null;
  }
  await prisma.integrationOAuthAuthCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { tenantId: row.tenantId, scope: row.scope };
}

export async function issueTokens(input: { tenantId: string; clientId: string; scope: string }) {
  const accessRaw = "cs_oat_" + crypto.randomBytes(32).toString("base64url");
  const refreshRaw = "cs_ort_" + crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await prisma.integrationOAuthAccessToken.create({
    data: {
      tenantId: input.tenantId,
      tokenHash: hashToken(accessRaw),
      refreshTokenHash: hashToken(refreshRaw),
      clientId: input.clientId,
      scope: input.scope,
      expiresAt: new Date(now + ACCESS_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    },
  });
  return {
    access_token: accessRaw,
    token_type: "Bearer" as const,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refreshRaw,
    scope: input.scope,
  };
}

export async function refreshAccessToken(refreshRaw: string, clientId: string) {
  const rh = hashToken(refreshRaw);
  const row = await prisma.integrationOAuthAccessToken.findUnique({ where: { refreshTokenHash: rh } });
  if (
    !row ||
    row.revokedAt != null ||
    !row.refreshExpiresAt ||
    row.refreshExpiresAt < new Date() ||
    row.clientId !== clientId
  ) {
    return null;
  }
  await prisma.integrationOAuthAccessToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return issueTokens({ tenantId: row.tenantId, clientId: row.clientId, scope: row.scope });
}

export async function resolveBearerAccessToken(bearerRaw: string) {
  const th = hashToken(bearerRaw);
  const row = await prisma.integrationOAuthAccessToken.findUnique({ where: { tokenHash: th } });
  if (!row || row.revokedAt != null || row.expiresAt < new Date()) return null;
  return { tenantId: row.tenantId, scope: row.scope, clientId: row.clientId, id: row.id };
}
