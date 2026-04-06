import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256(secret, subscriberId) as lowercase hex  matches Churnkey-style server signing. */
export function verifyEmbedAuthHash(
  secret: string,
  subscriberId: string,
  authHashHex: string | undefined | null,
): boolean {
  if (!secret || !subscriberId || authHashHex == null) return false;
  const expected = createHmac("sha256", secret).update(subscriberId, "utf8").digest("hex");
  const got = String(authHashHex).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  } catch {
    return false;
  }
}
