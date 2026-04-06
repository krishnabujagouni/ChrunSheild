/**
 * Production rate limiting via Upstash Redis + @upstash/ratelimit.
 *
 * Fails OPEN when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not
 * set (e.g. local dev without Redis). Set both env vars for production.
 *
 * Usage:
 *   const limited = await checkRateLimit("cancelChat", `${snippetKey}:${sessionId}`, corsHeaders);
 *   if (limited) return limited;   // 429 response, return immediately
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Input validation bounds  enforced at every public endpoint
export const MAX_MRR    = 10_000;   // $10k/mo cap on subscriptionMrr
export const MAX_ID_LEN = 255;      // subscriberId / sessionId max length

// ── Redis client ──────────────────────────────────────────────────────────────

function makeRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();

// ── Limiter factory ───────────────────────────────────────────────────────────

type Window = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

function makeLimiter(requests: number, window: Window, prefix: string): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix:  `cs:rl:${prefix}`,
    analytics: true,   // visible in Upstash console
  });
}

// ── Per-endpoint limiters ─────────────────────────────────────────────────────

export const limiters = {
  // Identifier: snippetKey:subscriberId
  cancelIntent:     makeLimiter(10,  "5 m",  "cancel-intent"),
  // Identifier: snippetKey:sessionId
  cancelChat:       makeLimiter(30,  "10 m", "cancel-chat"),
  // Identifier: sessionId
  cancelOutcome:    makeLimiter(5,   "5 m",  "cancel-outcome"),
  // Identifier: snippetKey:subscriberId   pause is a Stripe call, be strict
  pause:            makeLimiter(3,   "1 h",  "pause"),
  // Identifier: snippetKey:subscriberId
  subscriberStatus: makeLimiter(60,  "1 m",  "subscriber-status"),
  // Identifier: tenantId:endpointId — prevent spamming test events
  webhookTest:      makeLimiter(5,   "1 m",  "webhook-test"),
} as const;

type LimiterKey = keyof typeof limiters;

// ── Main helper ───────────────────────────────────────────────────────────────

/**
 * Check rate limit. Returns a 429 NextResponse if exceeded, null if allowed.
 * Caller must `return limited` immediately when non-null.
 */
export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
  corsHeadersFn: () => HeadersInit,
): Promise<NextResponse | null> {
  const limiter = limiters[key];
  if (!limiter) return null;  // Redis not configured  fail open

  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  if (success) return null;

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return NextResponse.json(
    { error: "rate_limit_exceeded", retryAfter: retryAfterSec },
    {
      status: 429,
      headers: {
        ...(corsHeadersFn() as Record<string, string>),
        "Retry-After":          String(retryAfterSec),
        "X-RateLimit-Limit":    String(limit),
        "X-RateLimit-Remaining": String(remaining),
      },
    },
  );
}
