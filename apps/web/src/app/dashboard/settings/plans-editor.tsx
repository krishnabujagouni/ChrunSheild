"use client";
import { useEffect, useState } from "react";
import type { StripePriceOption } from "@/app/api/dashboard/stripe/prices/route";

type Plan = { name: string; priceMonthly: number; stripePriceId?: string };

export function PlansEditor({
  initialPlans,
  initialAllowDowngrade,
  stripeConnected,
}: {
  initialPlans: Plan[];
  initialAllowDowngrade: boolean;
  stripeConnected: boolean;
}) {
  const [allowDowngrade, setAllowDowngrade] = useState(initialAllowDowngrade);
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [stripePrices, setStripePrices] = useState<StripePriceOption[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    if (!stripeConnected || !allowDowngrade) return;
    setLoadingPrices(true);
    fetch("/api/dashboard/stripe/prices")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices) setStripePrices(data.prices);
      })
      .catch(() => {})
      .finally(() => setLoadingPrices(false));
  }, [stripeConnected, allowDowngrade]);

  const removePlan = (i: number) => setPlans((p) => p.filter((_, j) => j !== i));

  const addFromStripe = (priceId: string) => {
    const opt = stripePrices.find((p) => p.priceId === priceId);
    if (!opt) return;
    // Don't add duplicates
    if (plans.some((p) => p.stripePriceId === priceId)) return;
    setPlans((prev) => [
      ...prev,
      { name: opt.productName, priceMonthly: opt.amount, stripePriceId: opt.priceId },
    ]);
  };

  // Prices not yet added to the plan list
  const availablePrices = stripePrices.filter(
    (sp) => !plans.some((p) => p.stripePriceId === sp.priceId),
  );

  return (
    <>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 0", cursor: "pointer" }}>
        <input
          type="checkbox"
          name="allowPlanDowngrade"
          value="true"
          checked={allowDowngrade}
          onChange={(e) => setAllowDowngrade(e.target.checked)}
          style={{ marginTop: 2, accentColor: "#7C3AED", width: 16, height: 16, flexShrink: 0 }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Allow plan downgrade</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Suggest a cheaper plan as an alternative to cancelling
          </div>
        </div>
      </label>

      {allowDowngrade && (
        <div style={{ marginLeft: 30, marginBottom: 12 }}>

          {/* Not connected to Stripe */}
          {!stripeConnected && (
            <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 12px" }}>
              Connect Stripe first — your plans will be imported automatically.{" "}
              <a href="/dashboard/connections" style={{ color: "#92400e", fontWeight: 600 }}>Connect Stripe →</a>
            </div>
          )}

          {/* Loading */}
          {stripeConnected && loadingPrices && (
            <p style={{ fontSize: 12, color: "#94a3b8" }}>Fetching your Stripe prices…</p>
          )}

          {/* Selected plans list */}
          {plans.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {plans.map((plan, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#f8fafc", border: "1px solid #e2e8f0",
                  borderRadius: 8, padding: "10px 14px",
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{plan.name}</span>
                    <span style={{ fontSize: 13, color: "#64748b", marginLeft: 8 }}>${plan.priceMonthly}/mo</span>
                    {plan.stripePriceId && (
                      <span style={{ fontSize: 11, color: "#22c55e", marginLeft: 8, fontWeight: 500 }}>● Stripe linked</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePlan(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Dropdown to add from Stripe */}
          {stripeConnected && !loadingPrices && stripePrices.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                defaultValue=""
                onChange={(e) => { addFromStripe(e.target.value); e.target.value = ""; }}
                style={{
                  border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, color: "#0f172a",
                  background: "#fff", cursor: "pointer", outline: "none",
                  flex: 1, maxWidth: 340,
                }}
              >
                <option value="" disabled>
                  {availablePrices.length === 0 ? "All prices added" : "+ Add a plan from your Stripe prices"}
                </option>
                {availablePrices.map((sp) => (
                  <option key={sp.priceId} value={sp.priceId}>
                    {sp.productName} — ${sp.amount}/mo
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Stripe connected but no prices found */}
          {stripeConnected && !loadingPrices && stripePrices.length === 0 && (
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              No active recurring prices found in your Stripe account.
            </p>
          )}

        </div>
      )}

      <input type="hidden" name="plans" value={JSON.stringify(plans)} />
    </>
  );
}
