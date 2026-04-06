import { randomBytes } from "node:crypto";

export function generateEmbedHmacSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Public app id (cs_app_...)  accepted with snippet key for tenant lookup on cancel APIs */
export function generateEmbedAppId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "cs_app_";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
