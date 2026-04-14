"use client";
import { useEffect, useState } from "react";
import type { StripeProductOption } from "@/app/api/dashboard/stripe/products/route";

export function ProductSelector() {
  const [products, setProducts] = useState<StripeProductOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stripe/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          setSelected(new Set(data.activeProductIds ?? []));
        }
      })
      .catch(() => setError("Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stripe/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProductIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "16px 0", fontSize: 13, color: "#94a3b8" }}>
        Loading your Stripe products…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div style={{ padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
        No active recurring products found in your Stripe account. Create a product in Stripe and it will appear here.
      </div>
    );
  }

  const noneSelected = selected.size === 0;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {products.map((product) => {
          const isSelected = selected.has(product.productId);
          return (
            <label
              key={product.productId}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 16px",
                border: `1px solid ${isSelected ? "#7C3AED" : "#e2e8f0"}`,
                borderRadius: 10, cursor: "pointer",
                background: isSelected ? "#f5f3ff" : "#fff",
                transition: "all 150ms ease",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(product.productId)}
                style={{ marginTop: 2, accentColor: "#7C3AED", width: 15, height: 15, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#5B21B6" : "#0f172a" }}>
                  {product.name}
                </div>
                {product.description && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>
                    {product.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  {product.priceCount} price{product.priceCount !== 1 ? "s" : ""}
                  {product.lowestMonthly > 0 ? ` · from $${product.lowestMonthly}/mo` : ""}
                </div>
              </div>
              {isSelected && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#7C3AED", background: "#ede9fe", padding: "2px 8px", borderRadius: 99, flexShrink: 0, alignSelf: "center" }}>
                  Protected
                </span>
              )}
            </label>
          );
        })}
      </div>

      {noneSelected && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
          No products selected  ChurnQ will intercept cancel events for <strong>all</strong> subscribers.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
          {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        style={{
          padding: "9px 20px", fontSize: 13, fontWeight: 600,
          background: saved ? "#dcfce7" : "#18181b",
          color: saved ? "#166534" : "#fff",
          border: saved ? "1px solid #86efac" : "none",
          borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
          transition: "all 200ms ease",
        }}
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save product selection"}
      </button>
    </div>
  );
}
