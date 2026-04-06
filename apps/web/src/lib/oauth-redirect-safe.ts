/** Prevent open redirects: only same-origin OAuth authorize URLs may be used after sign-in. */
export function isSafeOAuthReturnUrl(raw: string, appBase: string): string | null {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  try {
    const u = new URL(decoded);
    const base = new URL(appBase.endsWith("/") ? appBase.slice(0, -1) : appBase);
    if (u.origin !== base.origin) return null;
    if (!u.pathname.startsWith("/api/integrations/oauth/authorize")) return null;
    return decoded;
  } catch {
    return null;
  }
}
