import { NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findTenantByPublicEmbedId } from "@/lib/tenant-by-embed";
import { checkRateLimit, MAX_ID_LEN } from "@/lib/rate-limit";
import { setSaveSessionSubscriberEmail } from "@/lib/save-session-emails";
import { normalizeSubscriberEmail, validateSubscriberIdForStripeConnect } from "@/lib/subscriber-stripe";
import { resolveBillingOfferFromSession, merchantOfferSettingsFromStoredJson } from "@/lib/cancel-agent";
import { sendSlackSaveAlert } from "@/lib/slack";
import { sendDiscordSaveAlert } from "@/lib/discord";
import { fireWebhooks } from "@/lib/webhooks";

const _stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

function merchLabel(name: string): string {
  const t = name.replace(/\s+/g, " ").trim();
  return (t.length ? t : "Subscription").slice(0, 40);
}

function stripeCouponDisplayName(merchantName: string, discountPct: number, months: number): string {
  const brand = merchLabel(merchantName);
  const raw = `${brand} · ${discountPct}% off (${months} mo)`;
  return raw.length <= 80 ? raw : `${raw.slice(0, 77)}…`;
}

/** One shared Stripe coupon per connected account and discount "shape" (percent × months). */
function retentionCouponStripeId(percent: number, months: number): string {
  return `churnshield_ret_${percent}p_${months}m`;
}

function retentionCouponMatchesShape(c: Stripe.Coupon, percent: number, months: number): boolean {
  return (
    c.duration === "repeating" &&
    (c.duration_in_months ?? 0) === months &&
    Number(c.percent_off) === percent
  );
}

/** True if this coupon was created by ChurnShield retention (new test runs must replace, not stack). */
function isChurnShieldRetentionCoupon(c: Stripe.Coupon): boolean {
  if (c.metadata?.source === "churnshield") return true;
  if (typeof c.id === "string" && c.id.startsWith("churnshield_ret_")) return true;
  // Legacy one-off coupons before shared ids / metadata
  if (typeof c.name === "string" && /^ChurnShield\s+\d+%\s+retention offer$/i.test(c.name.trim())) {
    return true;
  }
  return false;
}

/**
 * Subscription-level discounts to keep when applying a new retention %  everything except
 * ChurnShield retention coupons (merchant coupons and other discounts stay stacked).
 */
async function nonChurnShieldDiscountUpdateParams(
  stripe: Stripe,
  subId: string,
  reqOpts: Stripe.RequestOptions,
): Promise<Stripe.SubscriptionUpdateParams.Discount[]> {
  const full = await stripe.subscriptions.retrieve(subId, {
    expand: ["discounts.coupon", "discount.coupon"],
  }, reqOpts);

  const out: Stripe.SubscriptionUpdateParams.Discount[] = [];
  const seen = new Set<string>();

  const addKeep = (discountId: string | undefined) => {
    if (!discountId || seen.has(discountId)) return;
    seen.add(discountId);
    out.push({ discount: discountId });
  };

  const couponFromDiscount = async (disc: Stripe.Discount): Promise<Stripe.Coupon | null> => {
    const cpn = disc.coupon;
    if (!cpn) return null;
    if (typeof cpn === "string") {
      return stripe.coupons.retrieve(cpn, reqOpts);
    }
    return cpn;
  };

  for (const d of full.discounts ?? []) {
    // discounts are expanded via expand:["discounts.coupon"] above  skip bare IDs
    if (typeof d === "string") continue;
    const disc: Stripe.Discount = d;
    const couponObj = await couponFromDiscount(disc);
    if (couponObj && !isChurnShieldRetentionCoupon(couponObj)) {
      addKeep(disc.id);
    }
  }

  const leg = full.discount;
  if (leg && typeof leg === "object" && leg.id && !seen.has(leg.id)) {
    const couponObj = await couponFromDiscount(leg as Stripe.Discount);
    if (couponObj && !isChurnShieldRetentionCoupon(couponObj)) {
      addKeep(leg.id);
    }
  }

  return out;
}

/**
 * Reuse the same Coupon object for every subscriber on this Connect account with the same
 * percent/duration so the Dashboard does not fill with duplicate coupons.
 */
async function getOrCreateRetentionCoupon(
  stripe: Stripe,
  reqOpts: Stripe.RequestOptions,
  discountPct: number,
  merchantDisplayName: string,
  months: number,
): Promise<Stripe.Coupon> {
  const stableId = retentionCouponStripeId(discountPct, months);
  const displayName = stripeCouponDisplayName(merchantDisplayName, discountPct, months);
  const metadata = {
    source: "churnshield",
    retention_discount_months: String(months),
  };

  try {
    const existing = await stripe.coupons.retrieve(stableId, reqOpts);
    if (retentionCouponMatchesShape(existing, discountPct, months)) {
      if (existing.name !== displayName) {
        try {
          await stripe.coupons.update(stableId, { name: displayName, metadata }, reqOpts);
        } catch {
          // name/metadata refresh is best-effort
        }
      }
      return existing;
    }
    // ID taken by a different coupon  do not overwrite; fall back to a one-off coupon.
    return await stripe.coupons.create(
      {
        percent_off: discountPct,
        duration: "repeating",
        duration_in_months: months,
        name: displayName,
        metadata,
      },
      reqOpts,
    );
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing")) {
      throw err;
    }
  }

  try {
    return await stripe.coupons.create(
      {
        id: stableId,
        percent_off: discountPct,
        duration: "repeating",
        duration_in_months: months,
        name: displayName,
        metadata,
      },
      reqOpts,
    );
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && /already exists/i.test(err.message ?? "")) {
      return stripe.coupons.retrieve(stableId, reqOpts);
    }
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.param === "id") {
      return stripe.coupons.create(
        {
          percent_off: discountPct,
          duration: "repeating",
          duration_in_months: months,
          name: displayName,
          metadata,
        },
        reqOpts,
      );
    }
    throw err;
  }
}

/**
 * Apply the offered retention incentive to the subscriber's Stripe subscription.
 *
 * - discount   → coupon: percent_off, duration repeating for RETENTION_DISCOUNT_DURATION_MONTHS only (then list price)
 * - extension  → negative customer balance credit (2 weeks of MRR)
 * - pause      → pause_collection: mark_uncollectible on active subscription
 * - empathy    → no Stripe action needed (subscriber stays at full price, nothing changes)
 * - downgrade  → subscription item price swapped to merchant-configured Stripe Price id (single-item subs)
 *
 * Fails silently  a Stripe error never rejects the save record.
 */
async function applyStripeOffer(
  customerId: string,
  stripeConnectId: string | null,
  offerType: OfferType,
  discountPct: number,
  subscriptionMrr: number,
  merchantDisplayName: string,
  discountDurationMonths: number,
  preferredStripeSubscriptionId: string | null,
  downgradeStripePriceId: string | null,
): Promise<{ applied: boolean; detail?: string }> {
  if (!_stripe)            return { applied: false, detail: "stripe_not_configured" };
  if (offerType === "empathy") {
    return { applied: false, detail: "no_stripe_action_for_offer_type" };
  }

  const idCheck = validateSubscriberIdForStripeConnect(customerId);
  if (!idCheck.ok) {
    return { applied: false, detail: `${idCheck.error}: ${idCheck.hint}` };
  }

  // When no Connect account is linked (e.g. during testing), operate on the
  // platform's own Stripe account directly  no stripeAccount header.
  const opts: Stripe.RequestOptions = stripeConnectId ? { stripeAccount: stripeConnectId } : {};

  try {
    let subscription: Stripe.Subscription;

    if (preferredStripeSubscriptionId) {
      const sub = await _stripe.subscriptions.retrieve(preferredStripeSubscriptionId, opts);
      const subCustomer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (subCustomer !== customerId) {
        return { applied: false, detail: "subscription_customer_mismatch" };
      }
      subscription = sub;
    } else {
      const subs = await _stripe.subscriptions.list(
        { customer: customerId, status: "active", limit: 1 },
        opts,
      );
      const first = subs.data[0];
      if (!first) return { applied: false, detail: "no_active_subscription_found" };
      subscription = first;
    }

    // ── Downgrade: swap subscription item to target Price (same currency/product expectations on merchant) ──
    if (offerType === "downgrade") {
      const firstItem = subscription.items?.data?.[0];
      if (!firstItem?.id) {
        return { applied: false, detail: "subscription_no_items" };
      }
      const priceId = (downgradeStripePriceId ?? "").trim();
      if (!priceId.startsWith("price_")) {
        return { applied: false, detail: "downgrade_no_stripe_price" };
      }
      const keepDiscounts = await nonChurnShieldDiscountUpdateParams(
        _stripe,
        subscription.id,
        opts,
      );
      await _stripe.subscriptions.update(
        subscription.id,
        {
          items: [{ id: firstItem.id, price: priceId }],
          discounts: keepDiscounts,
          proration_behavior: "none",
        },
        opts,
      );
      // Belt-and-suspenders: remove ChurnShield coupons from both the legacy
      // subscription.discount field and the customer.discount field  the new-style
      // subscription.discounts array is already cleared by discounts: keepDiscounts above.
      try {
        // 1) Legacy subscription-level discount (singular field, pre-2020 API style)
        await _stripe.subscriptions.deleteDiscount(subscription.id, opts);
      } catch { /* no-op if not present */ }
      try {
        // 2) Customer-level discount  expand coupon so isChurnShieldRetentionCoupon works
        const cust = await _stripe.customers.retrieve(
          customerId,
          { expand: ["discount.coupon"] } as Stripe.CustomerRetrieveParams,
          opts,
        );
        if (!("deleted" in cust) && cust.discount?.coupon) {
          const cpn = typeof cust.discount.coupon === "string"
            ? await _stripe.coupons.retrieve(cust.discount.coupon, opts)
            : cust.discount.coupon;
          if (isChurnShieldRetentionCoupon(cpn)) {
            await _stripe.customers.deleteDiscount(customerId, opts);
          }
        }
      } catch { /* best-effort */ }
      return { applied: true, detail: `downgrade_${priceId}` };
    }

    // ── Discount: shared coupon per {pct × months} on this Connect account + apply ──
    if (offerType === "discount" && discountPct > 0) {
      const coupon = await getOrCreateRetentionCoupon(
        _stripe,
        opts,
        discountPct,
        merchantDisplayName,
        discountDurationMonths,
      );
      const keepDiscounts = await nonChurnShieldDiscountUpdateParams(
        _stripe,
        subscription.id,
        opts,
      );
      await _stripe.subscriptions.update(
        subscription.id,
        {
          // Drop prior ChurnShield retention coupons so a new save does not stack 40% + 25%.
          discounts: [...keepDiscounts, { coupon: coupon.id }],
        },
        opts,
      );
      return { applied: true, detail: `coupon_${coupon.id}` };
    }

    // ── Extension: 2-week credit as negative customer balance ─────────────────
    if (offerType === "extension") {
      const creditCents = Math.round((subscriptionMrr / 30) * 14 * 100);
      const brand = merchLabel(merchantDisplayName);
      await _stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount:      -creditCents,   // negative = credit toward next invoice
          currency:    "usd",
          description: `${brand} · account credit (retention offer)`,
          metadata:    { source: "churnshield" },
        },
        opts,
      );
      return { applied: true, detail: `credit_${creditCents}_cents` };
    }

    // ── Pause: pause_collection on subscription ───────────────────────────────
    if (offerType === "pause") {
      await _stripe.subscriptions.update(
        subscription.id,
        { pause_collection: { behavior: "mark_uncollectible" } },
        opts,
      );
      return { applied: true, detail: `paused_sub_${subscription.id}` };
    }

    return { applied: false, detail: "unhandled_offer_type" };
  } catch (err) {
    // Never let a Stripe error block the save record  log and continue
    const isNotFound = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
    if (isNotFound) {
      console.warn("[ChurnShield] applyStripeOffer: Stripe resource not found (stale test data?)", offerType, err.message);
    } else {
      console.error("[ChurnShield] applyStripeOffer failed", offerType, err);
    }
    return { applied: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Fee rate ChurnShield charges per successful save (15% of retained MRR, per product doc §3). */
const FEE_RATE = 0.15;

/**
 * Offer types and their billing behaviour:
 *
 * pause     → subscriber resumes at FULL MRR. Confirm immediately (Stripe pause is proof).
 * empathy   → no offer made, empathy alone worked. Full MRR. Confirm immediately.
 * extension → subscriber pays FULL MRR after the free period. Confirm only after invoice.paid.
 * discount  → subscriber pays REDUCED MRR ongoing. Confirm after invoice.paid (actual amount).
 * downgrade → subscriber on a cheaper plan. Confirm after invoice.paid (new plan amount).
 */
type OfferType = "pause" | "extension" | "discount" | "downgrade" | "empathy";

/** Offer types where the save is confirmed immediately (no need to wait for payment). */
// pause is deferred  fee charged after subscriber's invoice.paid fires post-pause
// empathy is caught by monthly billing sweep (no Stripe invoice to match against)
const IMMEDIATE_CONFIRM = new Set<OfferType>(["empathy"]);

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

type Body = {
  snippetKey?: string;
  appId?: string;
  sessionId?: string;
  outcome?: "saved" | "cancelled";
  offerMade?: string;
  /** One of: pause | extension | discount | downgrade | empathy */
  offerType?: string;
  /** For discount offers  the percentage off (10, 25, or 40). */
  discountPct?: number;
  /** Optional  saved to session for merchant dashboard if not set at cancel-intent */
  subscriberEmail?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  const embedPublicId = body.snippetKey?.trim() || body.appId?.trim();
  const sessionId  = body.sessionId?.trim()?.slice(0, MAX_ID_LEN);
  const outcome    = body.outcome;

  if (!embedPublicId || !sessionId || !outcome) {
    return NextResponse.json(
      { error: "snippetKey (or appId), sessionId, and outcome are required" },
      { status: 400, headers: corsHeaders() },
    );
  }
  if (outcome !== "saved" && outcome !== "cancelled") {
    return NextResponse.json({ error: "outcome must be saved or cancelled" }, { status: 400, headers: corsHeaders() });
  }

  const limited = await checkRateLimit("cancelOutcome", sessionId, corsHeaders);
  if (limited) return limited;

  const tenant = await findTenantByPublicEmbedId(embedPublicId);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_embed_key" }, { status: 401, headers: corsHeaders() });
  }

  const session = await prisma.saveSession.findFirst({
    where: { sessionId, tenantId: tenant.id },
  });
  if (!session) {
    return NextResponse.json({ error: "unknown_session" }, { status: 404, headers: corsHeaders() });
  }

  // Only write once  ignore if already confirmed
  if (session.outcomeConfirmedAt) {
    return NextResponse.json({ ok: true, alreadyRecorded: true }, { headers: corsHeaders() });
  }

  const saved = outcome === "saved";
  const mrr = new Decimal(session.subscriptionMrr);
  const rawPendingOffer = (session as { pendingOffer?: Prisma.JsonValue | null }).pendingOffer ?? null;

  const resolved = resolveBillingOfferFromSession({
    saved,
    pendingOffer: rawPendingOffer,
    bodyOfferType: body.offerType,
    bodyDiscountPct: body.discountPct,
    bodyOfferMade: body.offerMade,
    mrr: Number(session.subscriptionMrr),
    offerSettings: merchantOfferSettingsFromStoredJson(tenant.offerSettings),
  });

  // For cancelled outcomes: still record what was offered (offered-but-rejected event).
  // resolved.offerType is null when !saved, so pull directly from pending_offer.
  const rejectedOfferType: OfferType | null = !saved && rawPendingOffer && typeof rawPendingOffer === "object" && !Array.isArray(rawPendingOffer)
    ? ((rawPendingOffer as Record<string, unknown>).type as OfferType | null) ?? null
    : null;

  const offerType: OfferType | null = saved && resolved.offerType
    ? (resolved.offerType as OfferType)
    : rejectedOfferType;

  // For immediate offer types (pause / empathy): set outcomeConfirmedAt now + calculate fee.
  // For deferred types (extension / discount / downgrade): leave outcomeConfirmedAt null 
  // stripe_worker sets it when invoice.paid fires, confirming the subscriber actually paid.
  const confirmImmediately = offerType !== null && IMMEDIATE_CONFIRM.has(offerType);

  let savedValue: Decimal | null = null;
  let feeCharged: Decimal | null = null;

  if (saved && confirmImmediately) {
    // empathy: full MRR retained, charge immediately via monthly sweep
    savedValue = mrr;
    feeCharged = mrr.mul(FEE_RATE).toDecimalPlaces(2);
  } else if (saved && offerType === "pause") {
    // Pre-calculate expected fee  actual charge fires on invoice.paid after pause ends
    savedValue = mrr;
    feeCharged = mrr.mul(FEE_RATE).toDecimalPlaces(2);
  } else if (saved && offerType === "discount") {
    // Pre-calculate fee on discounted MRR so billing knows expected amount.
    // stripe_worker will recalculate from actual invoice amount for accuracy.
    const pct = Math.max(0, Math.min(100, resolved.discountPct));
    const netMrr = mrr.mul(new Decimal(1).minus(new Decimal(pct).div(100)));
    savedValue = netMrr.toDecimalPlaces(2);
    feeCharged = netMrr.mul(FEE_RATE).toDecimalPlaces(2);
  } else if (saved && offerType === "downgrade" && resolved.downgradeNewMrr != null && resolved.downgradeNewMrr > 0) {
    const netMrr = new Decimal(resolved.downgradeNewMrr);
    savedValue = netMrr.toDecimalPlaces(2);
    feeCharged = netMrr.mul(FEE_RATE).toDecimalPlaces(2);
  }
  // extension: savedValue and feeCharged stay null until invoice.paid

  const emailFromClient = normalizeSubscriberEmail(body.subscriberEmail);

  const offerMadeFinal =
    resolved.offerMade?.slice(0, 500) ?? body.offerMade?.slice(0, 500) ?? null;

  await prisma.saveSession.update({
    where: { sessionId },
    data: {
      offerMade:          offerMadeFinal,
      offerType,
      offerAccepted:      saved,
      // Only set for pause/empathy  deferred types wait for Stripe confirmation
      outcomeConfirmedAt: confirmImmediately ? new Date() : null,
      savedValue,
      feeCharged,
    },
  });

  if (emailFromClient) {
    await setSaveSessionSubscriberEmail(sessionId, emailFromClient);
  }

  /**
   * One subscriber can open multiple cancel sessions (e.g. 25% then later 40%). Each row used to
   * stay `offer_accepted=true` with `fee_billed_at` null  stripe_worker then matched the newest
   * on each invoice.paid, but **older** rows stayed pending and could match on a later invoice,
   * charging the merchant twice. Close out prior unbilled "saved" sessions for this subscriber.
   */
  if (saved) {
    await prisma.saveSession.updateMany({
      where: {
        tenantId:       tenant.id,
        subscriberId:   session.subscriberId,
        sessionId:      { not: session.sessionId },
        feeBilledAt:    null,
        offerAccepted:  true,
      },
      data: {
        offerAccepted:      false,
        feeCharged:         null,
        savedValue:         null,
        outcomeConfirmedAt: null,
      },
    });
  }

  // Apply the offer to the subscriber's Stripe account immediately.
  // Runs after DB write so a Stripe failure never blocks the save record.
  let stripeApplied = false;
  let stripeDetail: string | undefined;
  if (saved && offerType && offerType !== "empathy") {
    const discountPct = Math.max(0, Math.min(100, resolved.discountPct));
    const validDurations = [1, 2, 3, 6, 12];
    const safeDuration = validDurations.includes(resolved.discountMonths) ? resolved.discountMonths : 3;
    const result = await applyStripeOffer(
      session.subscriberId,
      tenant.stripeConnectId ?? null,
      offerType,
      discountPct,
      Number(session.subscriptionMrr),
      tenant.name,
      safeDuration,
      session.stripeSubscriptionId ?? null,
      resolved.downgradeStripePriceId?.trim() ?? null,
    );
    stripeApplied = result.applied;
    stripeDetail  = result.detail;
  }

  // Fire Slack + Discord alerts (non-blocking) after save
  if (saved) {
    const subscriberEmail = emailFromClient ?? null;
    const pct = resolved.discountPct > 0 ? resolved.discountPct : null;
    const alertOpts = {
      subscriberId: session.subscriberId,
      subscriberEmail,
      offerType: offerType ?? "empathy",
      discountPct: pct,
      mrrSaved: savedValue?.toNumber() ?? Number(session.subscriptionMrr),
      tenantName: tenant.name,
    };
    const t = tenant as { slackWebhookUrl?: string | null; discordWebhookUrl?: string | null };
    if (t.slackWebhookUrl) {
      sendSlackSaveAlert({ webhookUrl: t.slackWebhookUrl, ...alertOpts });
    }
    if (t.discordWebhookUrl) {
      sendDiscordSaveAlert({ webhookUrl: t.discordWebhookUrl, ...alertOpts });
    }
    fireWebhooks(tenant.id, "save.created", {
      tenant_id:        tenant.id,
      subscriber_id:    session.subscriberId,
      subscriber_email: alertOpts.subscriberEmail,
      offer_type:       alertOpts.offerType,
      discount_pct:     alertOpts.discountPct,
      mrr_saved:        alertOpts.mrrSaved,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      saved,
      offerType,
      stripeApplied,
      stripeDetail,
      // null for deferred types  fee confirmed after first payment
      savedValue: savedValue?.toNumber() ?? null,
      feeCharged: feeCharged?.toNumber() ?? null,
    },
    { headers: corsHeaders() },
  );
}
