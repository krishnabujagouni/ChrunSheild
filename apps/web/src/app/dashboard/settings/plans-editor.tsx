"use client";
import { useState } from "react";

type Plan = { name: string; priceMonthly: number };

export function PlansEditor({
  initialPlans,
  initialAllowDowngrade,
}: {
  initialPlans: Plan[];
  initialAllowDowngrade: boolean;
}) {
  const [allowDowngrade, setAllowDowngrade] = useState(initialAllowDowngrade);
  const [plans, setPlans] = useState<Plan[]>(initialPlans);

  const addPlan = () => setPlans((p) => [...p, { name: "", priceMonthly: 0 }]);
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
        <div style={{ marginLeft: 30, marginBottom: 8, paddingBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
            Your plans{" "}
            <span style={{ fontWeight: 400, color: "#94a3b8" }}>
              (Aria will only suggest plans cheaper than the subscriber&apos;s current plan)
            </span>
          </div>

          {plans.length === 0 && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              No plans added yet — Aria will use general downgrade language.
            </p>
          )}

          {plans.map((plan, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Plan name (e.g. Basic)"
                value={plan.name}
                onChange={(e) => updatePlan(i, "name", e.target.value)}
                style={{
                  flex: 2,
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "#0f172a",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>$</span>
                <input
                  type="number"
                  placeholder="0"
                  min={0}
                  value={plan.priceMonthly || ""}
                  onChange={(e) => updatePlan(i, "priceMonthly", Number(e.target.value))}
                  style={{
                    width: 80,
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    color: "#0f172a",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>/mo</span>
              </div>
              <button
                type="button"
                onClick={() => removePlan(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addPlan}
            style={{
              fontSize: 12,
              color: "#7C3AED",
              fontWeight: 600,
              background: "none",
              border: "1px dashed #c4b5fd",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            + Add plan
          </button>
        </div>
      )}

      {/* Serialise plans array for server action */}
      <input type="hidden" name="plans" value={JSON.stringify(plans)} />
    </>
  );
}
