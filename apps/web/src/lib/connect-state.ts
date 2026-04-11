import { createHmac, timingSafeEqual } from "crypto";

const PREFIX = "v1";

function getSecret(): string {
  const s = process.env.ChurnQ_ONBOARD_SECRET;
  if (!s) {
    throw new Error("ChurnQ_ONBOARD_SECRET is not set");
  }
  return s;
}

/** Signed opaque state for Stripe Connect OAuth (binds callback to tenant). */
export function signConnectState(tenantId: string): string {
  const secret = getSecret();
  const payload = Buffer.from(tenantId, "utf8").toString("base64url");
  const h = createHmac("sha256", secret).update(tenantId).digest("hex");
  return `${PREFIX}.${payload}.${h}`;
}

export function verifyConnectState(state: string | null): string | null {
  if (!state?.startsWith(`${PREFIX}.`)) return null;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [, payloadB64, sigHex] = parts;
  let tenantId: string;
  try {
    tenantId = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!tenantId) return null;
  const expected = createHmac("sha256", secret).update(tenantId).digest("hex");
  if (sigHex.length !== expected.length) return null;
  try {
    const a = Buffer.from(sigHex, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return tenantId;
}
