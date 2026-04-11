/**
 * ChurnQ public APIs expect `subscriberId` = Stripe Customer id on the merchant's
 * connected account (`cus_...`), same value as `subscription.customer` from Stripe.
 * Email or internal DB ids cause confusing Stripe errors (e.g. "No such customer: 'x@y.com'").
 */

const STRIPE_CUSTOMER_ID = /^cus_[a-zA-Z0-9]+$/;

export type SubscriberIdValidation =
  | { ok: true }
  | { ok: false; error: string; hint: string };

export function validateSubscriberIdForStripeConnect(subscriberId: string): SubscriberIdValidation {
  const id = subscriberId.trim();
  if (!id) {
    return {
      ok: false,
      error: "subscriber_id_empty",
      hint: "Call ChurnQ.identify({ subscriberId }) with the Stripe Customer id (cus_...).",
    };
  }
  if (id.includes("@")) {
    return {
      ok: false,
      error: "subscriber_id_must_not_be_email",
      hint:
        "Use the Stripe Customer id from the Dashboard or API (e.g. cus_abc123), not the customer's email.",
    };
  }
  if (!STRIPE_CUSTOMER_ID.test(id)) {
    return {
      ok: false,
      error: "subscriber_id_must_be_stripe_customer_id",
      hint: "Expected format cus_ followed by alphanumeric characters (Stripe’s default customer id).",
    };
  }
  return { ok: true };
}

const MAX_SUBSCRIBER_EMAIL = 320;

/** Optional email from the merchant app for dashboard display only (PII  treat as sensitive). */
const STRIPE_SUBSCRIPTION_ID = /^sub_[a-zA-Z0-9]+$/;

/** Optional Stripe Subscription id from the merchant app  used to apply retention offers to the correct subscription. */
export function normalizeStripeSubscriptionId(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!id) return null;
  if (!STRIPE_SUBSCRIPTION_ID.test(id)) return null;
  return id.length > 64 ? id.slice(0, 64) : id;
}

export function normalizeSubscriberEmail(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().slice(0, MAX_SUBSCRIBER_EMAIL);
  if (t.length < 3 || !t.includes("@")) return null;
  // One @, basic local@domain.tld shape  merchant is source of truth
  if (!/^[^\s@]+@[^\s@]+\.[^\s@][^\s@]*$/.test(t)) return null;
  return t;
}
