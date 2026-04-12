"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const MRR_RANGES = [
  "Under $1,000/mo",
  "$1,000 – $5,000/mo",
  "$5,000 – $20,000/mo",
  "$20,000 – $100,000/mo",
  "Over $100,000/mo",
];

const SUBSCRIBER_COUNTS = [
  "Under 100",
  "100 – 500",
  "500 – 2,000",
  "2,000 – 10,000",
  "Over 10,000",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    productName: "",
    productUrl: "",
    mrrRange: "",
    subscriberCount: "",
  });

  const set = (key: string, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const canProceedStep1 = form.productName.trim() && form.productUrl.trim();
  const canProceedStep2 = form.mrrRange && form.subscriberCount;

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafa",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "var(--font-inter, 'Inter', system-ui, sans-serif)",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
          <div style={{ width: 36, height: 36, background: "#18181b", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden>
              <polygon points="14,2 26,24 2,24" fill="none" stroke="#52525b" strokeWidth="2.5" strokeLinejoin="round" />
              <polygon points="14,2 26,24 2,24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="24 60" />
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#18181b", letterSpacing: "-0.02em" }}>ChurnQ</span>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 99,
              background: s <= step ? "#18181b" : "#e4e4e7",
              transition: "background 300ms ease",
            }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              Tell us about your product
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 28px", lineHeight: 1.6 }}>
              ChurnQ is built for SaaS founders. We need a few details to set up your account.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  Product name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme SaaS"
                  value={form.productName}
                  onChange={e => set("productName", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", fontSize: 14,
                    border: "1px solid #e2e8f0", borderRadius: 10,
                    outline: "none", boxSizing: "border-box",
                    fontFamily: "inherit", color: "#0f172a",
                    background: "#fff",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  Product website
                </label>
                <input
                  type="url"
                  placeholder="https://yourproduct.com"
                  value={form.productUrl}
                  onChange={e => set("productUrl", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", fontSize: 14,
                    border: "1px solid #e2e8f0", borderRadius: 10,
                    outline: "none", boxSizing: "border-box",
                    fontFamily: "inherit", color: "#0f172a",
                    background: "#fff",
                  }}
                />
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              style={{
                width: "100%", marginTop: 24, padding: "12px 0",
                background: canProceedStep1 ? "#18181b" : "#e4e4e7",
                color: canProceedStep1 ? "#fff" : "#94a3b8",
                border: "none", borderRadius: 10, fontSize: 14,
                fontWeight: 600, cursor: canProceedStep1 ? "pointer" : "not-allowed",
                fontFamily: "inherit", transition: "all 150ms ease",
              }}
            >
              Continue →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              Your subscription business
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 28px", lineHeight: 1.6 }}>
              This helps us configure ChurnQ correctly for your scale.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>
                  Monthly recurring revenue (MRR)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {MRR_RANGES.map(r => (
                    <label key={r} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", border: `1px solid ${form.mrrRange === r ? "#18181b" : "#e2e8f0"}`,
                      borderRadius: 10, cursor: "pointer", fontSize: 13,
                      background: form.mrrRange === r ? "#f4f4f5" : "#fff",
                      fontWeight: form.mrrRange === r ? 600 : 400,
                      transition: "all 150ms ease",
                    }}>
                      <input type="radio" name="mrr" value={r} checked={form.mrrRange === r} onChange={() => set("mrrRange", r)} style={{ accentColor: "#18181b" }} />
                      {r}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>
                  Number of active subscribers
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SUBSCRIBER_COUNTS.map(c => (
                    <label key={c} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", border: `1px solid ${form.subscriberCount === c ? "#18181b" : "#e2e8f0"}`,
                      borderRadius: 10, cursor: "pointer", fontSize: 13,
                      background: form.subscriberCount === c ? "#f4f4f5" : "#fff",
                      fontWeight: form.subscriberCount === c ? 600 : 400,
                      transition: "all 150ms ease",
                    }}>
                      <input type="radio" name="subs" value={c} checked={form.subscriberCount === c} onChange={() => set("subscriberCount", c)} style={{ accentColor: "#18181b" }} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#991b1b" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1, padding: "12px 0", background: "#fff",
                  color: "#374151", border: "1px solid #e2e8f0",
                  borderRadius: 10, fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canProceedStep2 || loading}
                style={{
                  flex: 2, padding: "12px 0",
                  background: canProceedStep2 && !loading ? "#18181b" : "#e4e4e7",
                  color: canProceedStep2 && !loading ? "#fff" : "#94a3b8",
                  border: "none", borderRadius: 10, fontSize: 14,
                  fontWeight: 600, cursor: canProceedStep2 && !loading ? "pointer" : "not-allowed",
                  fontFamily: "inherit", transition: "all 150ms ease",
                }}
              >
                {loading ? "Setting up…" : "Go to dashboard →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
