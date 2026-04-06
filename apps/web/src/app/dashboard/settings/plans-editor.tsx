"use client";
import { useState } from "react";

type Plan = { name: string; priceMonthly: number; stripePriceId?: string };

const inputStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
  background: "#fff",
  width: "100%",
} as const;

export function PlansEditor({
  initialPlans,
  initialAllowDowngrade,
}: {
  initialPlans: Plan[];
  initialAllowDowngrade: boolean;
}) {
  const [allowDowngrade, setAllowDowngrade] = useState(initialAllowDowngrade);
  const [plans, setPlans] = useState<Plan[]>(initialPlans);

  const addPlan = () => setPlans((p) => [...p, { name: "", priceMonthly: 0, stripePriceId: "" }]);
  const removePlan = (i: number) => setPlans((p) => p.filter((_, j) => j !== i));
  const updatePlan = (i: number, field: keyof Plan, value: string | number) =>
    setPlans((p) => p.map((pl, j) => (j === i ? { ...pl, [field]: value } : pl)));

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

          {plans.length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              No plans yet — click &quot;+ Add plan&quot; below.
            </p>
          ) : (
            <div style={{ marginBottom: 8 }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 28px", gap: 8, marginBottom: 4, paddingRight: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Plan name</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>$/mo</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Stripe Price ID{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    — copy from Stripe → Product → Price
                  </span>
                </span>
                <span />
              </div>

              {/* Plan rows */}
              {plans.map((plan, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 28px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="e.g. Basic"
                    value={plan.name}
                    onChange={(e) => updatePlan(i, "name", e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="0"
                    min={0}
                    value={plan.priceMonthly || ""}
                    onChange={(e) => updatePlan(i, "priceMonthly", Number(e.target.value))}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="price_..."
                    value={plan.stripePriceId ?? ""}
                    onChange={(e) => updatePlan(i, "stripePriceId", e.target.value.trim())}
                    style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => removePlan(i)}
                    title="Remove plan"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 18, lineHeight: 1, padding: 0, textAlign: "center" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addPlan}
            style={{
              fontSize: 12, color: "#7C3AED", fontWeight: 600,
              background: "none", border: "1px dashed #c4b5fd",
              borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            }}
          >
            + Add plan
          </button>
        </div>
      )}

      <input type="hidden" name="plans" value={JSON.stringify(plans)} />
    </>
  );
}
