import crypto from "crypto";
import { prisma } from "@/lib/db";

export type WebhookEvent = "save.created" | "high_risk.detected" | "webhook.test";

export const WEBHOOK_TIMEOUT_MS = 5_000;
export const WEBHOOK_MAX_ATTEMPTS = 3;
/** Shown in dashboard; prune old rows via cron later if needed */
export const WEBHOOK_LOG_RETENTION_DAYS = 15;

export interface SaveCreatedPayload {
  tenant_id: string;
  subscriber_id: string;
  subscriber_email?: string | null;
  offer_type: string;
  discount_pct?: number | null;
  mrr_saved: number;
}

export interface HighRiskPayload {
  tenant_id: string;
  subscriber_id: string;
  risk_score: number;
  risk_class: string;
  cancel_attempts: number;
  failed_payments: number;
  days_since_activity: number;
}

function sign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export interface WebhookPostResult {
  ok: boolean;
  httpStatus?: number;
  errorMessage?: string | null;
  responsePreview?: string | null;
  attempts: number;
  durationMs: number;
  payload: string;
}

/** POST signed JSON; retries with backoff. One payload string (and signature) for all attempts. */
export async function postWebhookSigned(
  url: string,
  secret: string,
  event: string,
  data: object
): Promise<WebhookPostResult> {
  const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
  const sig = sign(secret, payload);
  const t0 = Date.now();
  let lastHttp: number | undefined;
  let lastErr: string | null = null;
  let responsePreview: string | null = null;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
    attemptsUsed = attempt;
    try {
      const res = await fetch(url.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChurnShield-Signature": sig,
          "X-ChurnShield-Event": event,
        },
        body: payload,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        redirect: "manual",
      });
      lastHttp = res.status;
      const text = await res.text();
      responsePreview = text ? text.slice(0, 512) : null;
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        lastErr = loc
          ? `HTTP ${res.status} redirect to ${loc.slice(0, 200)} — redirects are not followed; paste the final webhook URL`
          : `HTTP ${res.status} redirect — use the direct URL with no redirects`;
      } else if (res.ok) {
        return {
          ok: true,
          httpStatus: res.status,
          errorMessage: null,
          responsePreview,
          attempts: attemptsUsed,
          durationMs: Date.now() - t0,
          payload,
        };
      } else if (res.status === 404) {
        lastErr =
          "HTTP 404 — no POST handler at this path (wrong token in the URL, typo, or expired webhook URL)";
      } else {
        lastErr = `HTTP ${res.status}`;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "network_error";
      lastHttp = undefined;
      responsePreview = null;
    }
    if (attempt < WEBHOOK_MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  return {
    ok: false,
    httpStatus: lastHttp,
    errorMessage: lastErr,
    responsePreview,
    attempts: attemptsUsed,
    durationMs: Date.now() - t0,
    payload,
  };
}

async function recordDelivery(input: {
  webhookEndpointId: string;
  tenantId: string;
  event: string;
  isTest: boolean;
  result: WebhookPostResult;
}): Promise<void> {
  const { result } = input;
  try {
    await prisma.webhookDelivery.create({
      data: {
        webhookEndpointId: input.webhookEndpointId,
        tenantId: input.tenantId,
        event: input.event,
        isTest: input.isTest,
        status: result.ok ? "delivered" : "failed",
        httpStatus: result.httpStatus ?? null,
        errorMessage: result.errorMessage ?? null,
        responsePreview: result.responsePreview ?? null,
        payload: result.payload,
        attempts: result.attempts,
        durationMs: result.durationMs,
      },
    });
  } catch {
    // never break caller
  }
}

async function deliverAndLog(input: {
  webhookEndpointId: string;
  tenantId: string;
  url: string;
  secret: string;
  event: string;
  data: object;
  isTest: boolean;
}): Promise<void> {
  const result = await postWebhookSigned(input.url, input.secret, input.event, input.data);
  await recordDelivery({
    webhookEndpointId: input.webhookEndpointId,
    tenantId: input.tenantId,
    event: input.event,
    isTest: input.isTest,
    result,
  });
}

/** Fire an event to all enabled webhook endpoints for this tenant. Non-blocking — never throws. */
export function fireWebhooks(tenantId: string, event: WebhookEvent, data: object): void {
  prisma.webhookEndpoint
    .findMany({ where: { tenantId, enabled: true, events: { has: event } } })
    .then(endpoints => {
      for (const ep of endpoints) {
        void deliverAndLog({
          webhookEndpointId: ep.id,
          tenantId,
          url: ep.url,
          secret: ep.secret,
          event,
          data,
          isTest: false,
        });
      }
    })
    .catch(() => {});
}

/** Generate a new signing secret for a webhook endpoint. */
export function generateWebhookSecret(): string {
  return "whsec_" + crypto.randomBytes(32).toString("hex");
}

/** Re-send using stored payload JSON: replaces `timestamp`, re-signs, logs a new row. */
export async function resendWebhookDelivery(input: {
  webhookEndpointId: string;
  tenantId: string;
  url: string;
  secret: string;
  storedPayload: string;
}): Promise<WebhookPostResult> {
  let event: string;
  let data: object;
  try {
    const parsed = JSON.parse(input.storedPayload) as { event?: string; data?: object };
    if (!parsed.event || typeof parsed.data !== "object" || parsed.data === null) {
      throw new Error("invalid_payload");
    }
    event = parsed.event;
    data = parsed.data;
  } catch {
    return {
      ok: false,
      errorMessage: "invalid_stored_payload",
      attempts: 0,
      durationMs: 0,
      payload: input.storedPayload,
    };
  }

  const result = await postWebhookSigned(input.url, input.secret, event, data);
  await recordDelivery({
    webhookEndpointId: input.webhookEndpointId,
    tenantId: input.tenantId,
    event,
    isTest: false,
    result,
  });
  return result;
}

/** Dashboard "Send test" — `webhook.test` event, logged with `isTest: true`. */
export async function runWebhookTest(endpoint: {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
}): Promise<void> {
  await deliverAndLog({
    webhookEndpointId: endpoint.id,
    tenantId: endpoint.tenantId,
    url: endpoint.url,
    secret: endpoint.secret,
    event: "webhook.test",
    data: { test: true, source: "churnshield_dashboard" },
    isTest: true,
  });
}
