import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Stripe from "stripe";

/**
 * Monthly billing sweep  runs on the 1st of every month at 6am UTC.
 *
 * Collects all SaveSessions from the previous calendar month where:
 *   - offerAccepted = true
 *   - feeBilledAt   = null  (not yet charged)
 *   - feeCharged    > 0     (has a calculable fee)
 *
 * Groups by tenant, sums all fees, and charges one Stripe PaymentIntent
 * per tenant via their connected Stripe account.
 *
 * This catches offer types that are never triggered by invoice.paid:
 *   - pause   (fee pre-calculated at save time, never charged by stripe_worker)
 *   - empathy (same)
 *
 * discount / extension / downgrade sessions are ALSO included if for some
 * reason stripe_worker missed them (e.g. no Stripe webhook delivered).
 */

const _stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!_stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  // Previous calendar month window
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd   = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive

  const label = `${periodStart.toISOString().slice(0, 7)}`; // "2026-03"

  // All unbilled confirmed saves  confirmed (outcomeConfirmedAt set) before end of last month.
  // createdAt filter removed: a Jan pause confirmed in March still bills on April 1st.
  const sessions = await prisma.saveSession.findMany({
    where: {
      offerAccepted:        true,
      feeBilledAt:          null,
      feeCharged:           { not: null, gt: 0 },
      outcomeConfirmedAt:   { not: null, lt: periodEnd },
    },
    select: {
      sessionId:  true,
      tenantId:   true,
      feeCharged: true,
      offerType:  true,
      tenant: {
        select: {
          stripeConnectId: true,
          ownerEmail:      true,
        },
      },
    },
  });

  if (sessions.length === 0) {
    console.log(`[billing-sweep] ${label}: no unbilled sessions found`);
    return NextResponse.json({ ok: true, period: label, tenants: 0, sessions: 0, totalCharged: 0 });
  }

  // Group by tenant
  type TenantGroup = {
    stripeConnectId: string | null;
    sessionIds: string[];
    totalCents: number;
  };
  const byTenant = new Map<string, TenantGroup>();

  for (const s of sessions) {
    const fee = Number(s.feeCharged ?? 0);
    if (fee <= 0) continue;

    const existing = byTenant.get(s.tenantId);
    if (existing) {
      existing.sessionIds.push(s.sessionId);
      existing.totalCents += Math.round(fee * 100);
    } else {
      byTenant.set(s.tenantId, {
        stripeConnectId: s.tenant.stripeConnectId || null,
        sessionIds: [s.sessionId],
        totalCents: Math.round(fee * 100),
      });
    }
  }

  const results: Array<{
    tenantId: string;
    sessions: number;
    totalCents: number;
    status: "charged" | "skipped_no_stripe" | "skipped_min_amount" | "failed";
    chargeId?: string;
    error?: string;
  }> = [];

  let grandTotalCharged = 0;

  for (const [tenantId, group] of byTenant) {
    const { stripeConnectId, sessionIds, totalCents } = group;

    // Skip if no Stripe Connect account linked
    if (!stripeConnectId) {
      console.warn(`[billing-sweep] ${label} tenant=${tenantId} skipped: no stripe_connect_id`);
      results.push({ tenantId, sessions: sessionIds.length, totalCents, status: "skipped_no_stripe" });
      continue;
    }

    // Stripe minimum is $0.50 (50 cents)
    if (totalCents < 50) {
      console.warn(`[billing-sweep] ${label} tenant=${tenantId} skipped: amount ${totalCents}c below minimum`);
      results.push({ tenantId, sessions: sessionIds.length, totalCents, status: "skipped_min_amount" });
      continue;
    }

    try {
      // Create a PaymentIntent on the tenant's connected account
      const pi = await _stripe.paymentIntents.create(
        {
          amount:      totalCents,
          currency:    "usd",
          confirm:     true,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          description: `ChurnQ saves  ${label} (${sessionIds.length} save${sessionIds.length !== 1 ? "s" : ""})`,
          metadata: {
            period:           label,
            session_count:    String(sessionIds.length),
            ChurnQ_type: "monthly_billing_sweep",
          },
        },
        { stripeAccount: stripeConnectId },
      );

      const chargeId = pi.id;

      // Mark all sessions as billed
      await prisma.saveSession.updateMany({
        where:  { sessionId: { in: sessionIds } },
        data:   { feeBilledAt: new Date(), stripeChargeId: chargeId },
      });

      grandTotalCharged += totalCents;
      console.log(`[billing-sweep] ${label} tenant=${tenantId} charged $${(totalCents / 100).toFixed(2)} sessions=${sessionIds.length} pi=${chargeId}`);
      results.push({ tenantId, sessions: sessionIds.length, totalCents, status: "charged", chargeId });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[billing-sweep] ${label} tenant=${tenantId} FAILED: ${msg}`);
      results.push({ tenantId, sessions: sessionIds.length, totalCents, status: "failed", error: msg });
    }
  }

  console.log(
    `[billing-sweep] ${label} done  tenants=${results.length} sessions=${sessions.length} total=$${(grandTotalCharged / 100).toFixed(2)}`,
  );

  return NextResponse.json({
    ok:           true,
    period:       label,
    tenants:      results.length,
    sessions:     sessions.length,
    totalCharged: grandTotalCharged / 100,
    results,
  });
}
