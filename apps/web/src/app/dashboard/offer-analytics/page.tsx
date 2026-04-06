"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type OfferRow = {
  offerType: string | null;
  attempts: number;
  saves: number;
  saveRate: number;
  avgMrr: number;
  totalMrrSaved: number;
  totalFees: number;
};

type Summary = {
  totalAttempts: number;
  totalSaves: number;
  overallSaveRate: number;
  bestOffer: string | null;
};

const OFFER_COLORS: Record<string, string> = {
  discount:  "#7C3AED",
  pause:     "#0369a1",
  extension: "#92400e",
  downgrade: "#9d174d",
  empathy:   "#166534",
};

const PERIOD_OPTIONS = [
  { label: "All time", days: 0 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

function label(offerType: string | null) {
  if (!offerType) return "No offer";
  return offerType.charAt(0).toUpperCase() + offerType.slice(1);
}

function color(offerType: string | null) {
  return OFFER_COLORS[offerType ?? ""] ?? "#94a3b8";
}

export default function OfferAnalyticsPage() {
  const [days, setDays] = useState(0);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/offer-analytics?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setSummary(data.summary ?? null);
      })
      .finally(() => setLoading(false));
  }, [days]);

  const pillBase: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#64748b",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Offer Analytics</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Save rate and revenue impact broken down by offer type
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{
                ...pillBase,
                borderColor: days === opt.days ? "#cbd5e1" : "#e2e8f0",
                background: days === opt.days ? "#f1f5f9" : "#fff",
                color: days === opt.days ? "#0f172a" : "#64748b",
                fontWeight: days === opt.days ? 600 : 500,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Total attempts",  value: summary.totalAttempts,                color: "#64748b", bg: "#f1f5f9" },
            { label: "Total saved",     value: summary.totalSaves,                   color: "#166534", bg: "#dcfce7" },
            { label: "Overall save rate", value: `${summary.overallSaveRate}%`,      color: "#7C3AED", bg: "#ede9fe" },
            { label: "Best offer",      value: summary.bestOffer ? label(summary.bestOffer) : "", color: "#0369a1", bg: "#e0f2fe" },
          ].map((c) => (
            <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "12px 20px", minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.color, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {c.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          No sessions yet. Run a cancel flow to see offer performance here.
        </div>
      ) : (
        <>
          {/* Bar chart  save rate by offer type */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 16 }}>Save Rate by Offer Type</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows.filter(r => r.offerType !== null)} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="offerType" tickFormatter={label} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  formatter={(v: unknown) => [`${v}%`, "Save rate"]}
                  labelFormatter={(v: unknown) => label(String(v))}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Bar dataKey="saveRate" radius={[6, 6, 0, 0]}>
                  {rows.filter(r => r.offerType !== null).map((r) => (
                    <Cell key={r.offerType} fill={color(r.offerType)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Offer type", "Attempts", "Saved", "Save rate", "Avg MRR", "MRR saved", "Fees earned"].map((h) => (
                      <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontWeight: 600, color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", fontSize: 12 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.offerType ?? "__null__"}
                      style={{ borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : undefined }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 600,
                          background: color(r.offerType) + "22",
                          color: color(r.offerType),
                        }}>
                          {label(r.offerType)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#374151" }}>{r.attempts}</td>
                      <td style={{ padding: "12px 16px", color: "#374151" }}>{r.saves}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 64, height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${r.saveRate}%`, height: "100%", background: color(r.offerType), borderRadius: 99 }} />
                          </div>
                          <span style={{ fontWeight: 600, color: color(r.offerType) }}>{r.saveRate}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#374151" }}>${r.avgMrr.toFixed(2)}</td>
                      <td style={{ padding: "12px 16px", fontWeight: r.totalMrrSaved > 0 ? 600 : 400, color: r.totalMrrSaved > 0 ? "#166534" : "#94a3b8" }}>
                        {r.totalMrrSaved > 0 ? `$${r.totalMrrSaved.toFixed(2)}` : ""}
                      </td>
                      <td style={{ padding: "12px 16px", color: r.totalFees > 0 ? "#7C3AED" : "#94a3b8", fontWeight: r.totalFees > 0 ? 600 : 400 }}>
                        {r.totalFees > 0 ? `$${r.totalFees.toFixed(2)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
