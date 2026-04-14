"use client";
import { useEffect, useState } from "react";
import type { StripeProductOption } from "@/app/api/dashboard/stripe/products/route";

export function StripeProductTags() {
  const [products, setProducts] = useState<StripeProductOption[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/stripe/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          setActiveIds(data.activeProductIds ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(ids: string[]) {
    setSaving(true);
    await fetch("/api/dashboard/stripe/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeProductIds: ids }),
    }).finally(() => setSaving(false));
  }

  async function addProduct(productId: string) {
    if (activeIds.includes(productId)) return;
    const next = [...activeIds, productId];
    setActiveIds(next);
    setDropdownOpen(false);
    await save(next);
  }

  async function removeProduct(productId: string) {
    const next = activeIds.filter((id) => id !== productId);
    setActiveIds(next);
    await save(next);
  }

  const activeProducts = products.filter((p) => activeIds.includes(p.productId));
  const availableToAdd = products.filter((p) => !activeIds.includes(p.productId));

  if (loading) {
    return <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Loading products…</div>;
  }

  // Single-product tenants don't need a selector
  if (products.length < 2) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Protecting
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>

        {/* Active product tags */}
        {activeProducts.map((p) => (
          <span
            key={p.productId}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "#f0fdf4", border: "1px solid #86efac",
              borderRadius: 99, padding: "4px 10px 4px 12px",
              fontSize: 12, fontWeight: 600, color: "#166534",
            }}
          >
            {p.name}
            <button
              onClick={() => removeProduct(p.productId)}
              disabled={saving}
              title="Remove"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#86efac", fontSize: 14, lineHeight: 1,
                padding: 0, display: "flex", alignItems: "center",
              }}
            >
              ×
            </button>
          </span>
        ))}

        {/* Empty state */}
        {activeProducts.length === 0 && (
          <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
            No products selected  embed the snippet first, then add here
          </span>
        )}

        {/* Add dropdown trigger */}
        {availableToAdd.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "#f4f4f5", border: "1px solid #e4e4e7",
                borderRadius: 99, padding: "4px 12px",
                fontSize: 12, fontWeight: 600, color: "#3f3f46",
                cursor: "pointer",
              }}
            >
              + Add product
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {dropdownOpen && (
              <>
                {/* Backdrop */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setDropdownOpen(false)}
                />
                {/* Dropdown */}
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0,
                  background: "#fff", border: "1px solid #e4e4e7",
                  borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
                  minWidth: 220, zIndex: 20, overflow: "hidden",
                }}>
                  {availableToAdd.map((p) => (
                    <button
                      key={p.productId}
                      onClick={() => addProduct(p.productId)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        width: "100%", padding: "10px 14px",
                        background: "none", border: "none",
                        borderBottom: "1px solid #f4f4f5",
                        cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.name}</span>
                      {p.lowestMonthly > 0 && (
                        <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                          from ${p.lowestMonthly}/mo · {p.priceCount} price{p.priceCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Saving indicator */}
        {saving && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Saving…</span>
        )}
      </div>
    </div>
  );
}
