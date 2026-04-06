/** Single scope for automation tools: create/list/delete outbound webhook endpoints. */
export const INTEGRATION_OAUTH_SCOPE = "webhooks:manage";

export type IntegrationOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  displayName: string;
};

/**
 * Set INTEGRATION_OAUTH_CLIENT_ID, INTEGRATION_OAUTH_CLIENT_SECRET, and
 * INTEGRATION_OAUTH_REDIRECT_URIS (comma-separated exact callback URLs, e.g. Zapier’s OAuth redirect).
 * Optional: INTEGRATION_OAUTH_CLIENT_NAME (shown on consent screen).
 */
export function getIntegrationOAuthClient(): IntegrationOAuthClientConfig | null {
  const clientId = process.env.INTEGRATION_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.INTEGRATION_OAUTH_CLIENT_SECRET?.trim();
  const urisRaw = process.env.INTEGRATION_OAUTH_REDIRECT_URIS?.trim();
  if (!clientId || !clientSecret || !urisRaw) return null;
  const redirectUris = urisRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (redirectUris.length === 0) return null;
  return {
    clientId,
    clientSecret,
    redirectUris,
    displayName: process.env.INTEGRATION_OAUTH_CLIENT_NAME?.trim() || "Automation app",
  };
}

export function isRedirectUriAllowed(uri: string, allowed: string[]): boolean {
  return allowed.some(a => a === uri);
}

export function validateIntegrationScopes(scope: string): boolean {
  const parts = scope.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(p => p === INTEGRATION_OAUTH_SCOPE);
}
