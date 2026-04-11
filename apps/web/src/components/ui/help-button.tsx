"use client";
import { useState } from "react";

type Tab = "help" | "requests";

const HELP_ITEMS = [
  {
    q: "How does ChurnQ work?",
    a: "You add one script tag to your cancel page. When a subscriber clicks cancel, ChurnQ intercepts the click, opens an AI chat, and makes a retention offer. You only pay 15% if the subscriber stays.",
  },
  {
    q: "How do I install the embed?",
    a: "Go to Integration in the sidebar. Copy the script tag and paste it before </body> on your cancel page. Then call window.ChurnQ.identify() with the subscriber's ID and MRR.",
  },
  {
    q: "When do I get charged?",
    a: "On the 1st of each month. ChurnQ bundles all confirmed saves from the previous month and creates one Stripe charge via your connected Stripe account.",
  },
  {
    q: "How do I connect Stripe?",
    a: "Go to Connections in the sidebar and click Connect under Stripe. You'll be taken through the Stripe OAuth flow. This is required for ChurnQ to apply discounts and pauses to subscriptions.",
  },
  {
    q: "What offer types are available?",
    a: "Discount (up to your configured max %), pause, free extension, and plan downgrade. You can toggle each on/off and set limits in Settings → Retention Offers.",
  },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("help");

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Help & Support"
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 50,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#18181b",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          transition: "transform 150ms ease, box-shadow 150ms ease",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 82,
          right: 28,
          zIndex: 50,
          width: 360,
          maxHeight: "70vh",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
          border: "1px solid #e4e4e7",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Help & Support</div>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0 }}>
              {(["help", "requests"] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: "none",
                  border: "none",
                  borderBottom: tab === t ? "2px solid #18181b" : "2px solid transparent",
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: tab === t ? 600 : 500,
                  color: tab === t ? "#18181b" : "#71717a",
                  cursor: "pointer",
                  transition: "all 150ms ease",
                  fontFamily: "inherit",
                }}>
                  {t === "help" ? "Help" : "Feature Requests"}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {tab === "help" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {HELP_ITEMS.map((item, i) => (
                  <div key={i} style={{ borderBottom: i < HELP_ITEMS.length - 1 ? "1px solid #f1f5f9" : "none", paddingBottom: i < HELP_ITEMS.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 5 }}>{item.q}</div>
                    <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6 }}>{item.a}</div>
                  </div>
                ))}
                <div style={{ paddingTop: 8, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b" }}>
                  Still stuck?{" "}
                  <a href="mailto:hello@churnq.com" style={{ color: "#18181b", fontWeight: 600, textDecoration: "underline" }}>
                    Email us
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ height: 420 }}>
                <iframe
                  src="https://app.userjot.com/cmnuo1mnc0y3i0iqy3mulay0g/d/requests?status=%5B%22PENDING%22%2C%22REVIEW%22%2C%22PLANNED%22%2C%22PROGRESS%22%5D&board=%5B%5D&tag=%5B%5D&order=newest&search="
                  style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
                  title="Feature Requests"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
