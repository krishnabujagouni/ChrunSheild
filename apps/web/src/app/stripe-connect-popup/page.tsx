"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StripeProductOption } from "@/app/api/dashboard/stripe/products/route";

export default function StripeConnectPopupPage() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("stripe_connected") === "1";
  const stripeError = searchParams.get("stripe_error");

  const [products, setProducts] = useState<StripeProductOption[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [selectedDropdown, setSelectedDropdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/dashboard/stripe/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          setActiveIds(data.activeProductIds ?? []);
          if (data.products.length > 0) {
            setSelectedDropdown(data.products[0].productId);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [connected]);

  function addProduct() {
    if (!selectedDropdown || activeIds.includes(selectedDropdown)) return;
    setActiveIds((prev) => [...prev, selectedDropdown]);
    setSaved(false);
  }

  function removeProduct(id: string) {
    setActiveIds((prev) => prev.filter((p) => p !== id));
    setSaved(false);
  }

  async function saveAndClose() {
    setSaving(true);
    try {
      await fetch("/api/dashboard/stripe/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProductIds: activeIds }),
      });
      setSaved(true);
      // Notify parent window to refresh
      if (window.opener) {
        window.opener.postMessage({ type: "stripe_connected" }, window.location.origin);
      }
      setTimeout(() => window.close(), 800);
    } finally {
      setSaving(false);
    }
  }

  function skipAndClose() {
    if (window.opener) {
      window.opener.postMessage({ type: "stripe_connected" }, window.location.origin);
    }
    window.close();
  }

  // ── Error state ──
  if (stripeError) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#991b1b", margin: "0 0 8px" }}>
            Connection failed
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
            {stripeError}
          </p>
          <button onClick={() => window.close()} style={secondaryBtnStyle}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Not yet connected (direct navigation) ──
  if (!connected) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: "#64748b" }}>Connecting to Stripe…</p>
        </div>
      </div>
    );
  }

  const availableToAdd = products.filter((p) => !activeIds.includes(p.productId));
  const selectedProducts = products.filter((p) => activeIds.includes(p.productId));

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
            ✓
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              Stripe connected!
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Now choose which products ChurnQ should protect
            </p>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
            Protected products
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
            ChurnQ will only intercept cancellations for the products below. Leave empty to protect all subscribers.
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "#94a3b8", padding: "12px 0" }}>Loading your Stripe products…</div>
          ) : products.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b", padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              No active recurring products found in your Stripe account.
            </div>
          ) : (
            <>
              {/* Dropdown + Add */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <select
                  value={selectedDropdown}
                  onChange={(e) => setSelectedDropdown(e.target.value)}
                  disabled={availableToAdd.length === 0}
                  style={{
                    flex: 1, padding: "9px 12px", fontSize: 13,
                    border: "1px solid #e2e8f0", borderRadius: 8,
                    background: "#fff", color: "#0f172a",
                    outline: "none", cursor: "pointer",
                  }}
                >
                  {availableToAdd.length === 0
                    ? <option>All products added</option>
                    : availableToAdd.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.name}{p.lowestMonthly > 0 ? ` · $${p.lowestMonthly}/mo` : ""}
                        </option>
                      ))
                  }
                </select>
                <button
                  onClick={addProduct}
                  disabled={availableToAdd.length === 0}
                  style={{
                    padding: "9px 16px", fontSize: 13, fontWeight: 600,
                    background: availableToAdd.length === 0 ? "#e4e4e7" : "#18181b",
                    color: availableToAdd.length === 0 ? "#94a3b8" : "#fff",
                    border: "none", borderRadius: 8,
                    cursor: availableToAdd.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  + Add
                </button>
              </div>

              {/* Added products list */}
              {selectedProducts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
                  {selectedProducts.map((p) => (
                    <div
                      key={p.productId}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "#f5f3ff", border: "1px solid #ddd6fe",
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#5B21B6" }}>{p.name}</div>
                        {p.lowestMonthly > 0 && (
                          <div style={{ fontSize: 11, color: "#7C3AED", marginTop: 1 }}>from ${p.lowestMonthly}/mo</div>
                        )}
                      </div>
                      <button
                        onClick={() => removeProduct(p.productId)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, padding: "2px 6px", lineHeight: 1 }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 4 }}>
                  No products added  ChurnQ will protect <strong>all</strong> subscribers.
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
          <button onClick={skipAndClose} style={{ ...secondaryBtnStyle, flex: 1 }}>
            Skip for now
          </button>
          <button
            onClick={saveAndClose}
            disabled={saving || loading}
            style={{
              flex: 2, padding: "10px 0", fontSize: 13, fontWeight: 600,
              background: saved ? "#dcfce7" : "#18181b",
              color: saved ? "#166534" : "#fff",
              border: saved ? "1px solid #86efac" : "none",
              borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
              transition: "all 200ms ease",
            }}
          >
            {saving ? "Saving…" : saved ? "Saved! Closing…" : "Save & close"}
          </button>
        </div>

      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#fafafa",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "var(--font-inter, 'Inter', system-ui, sans-serif)",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: "28px 28px 24px",
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 0",
  fontSize: 13,
  fontWeight: 600,
  background: "#fff",
  color: "#374151",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  cursor: "pointer",
};
