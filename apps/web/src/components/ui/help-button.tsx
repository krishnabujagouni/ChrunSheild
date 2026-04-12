"use client";
import { useState } from "react";

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
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Help & Support</div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {HELP_ITEMS.map((item, i) => (
                <div key={i} style={{ borderBottom: i < HELP_ITEMS.length - 1 ? "1px solid #f1f5f9" : "none", paddingBottom: i < HELP_ITEMS.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 5 }}>{item.q}</div>
                  <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6 }}>{item.a}</div>
                </div>
              ))}

              {/* Docs + Feature Requests links */}
              <div style={{ paddingTop: 8, borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 10 }}>
                <a
                  href="https://docs.churnq.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: 10, padding: "12px 14px",
                    textDecoration: "none", color: "#0f172a",
                    fontSize: 13, fontWeight: 600,
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#18181b"; (e.currentTarget as HTMLAnchorElement).style.background = "#f1f5f9"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLAnchorElement).style.background = "#f8fafc"; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <span style={{ flex: 1 }}>Read the Docs</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>

                <a
                  href="https://churnsheild.userjot.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: 10, padding: "12px 14px",
                    textDecoration: "none", color: "#0f172a",
                    fontSize: 13, fontWeight: 600,
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#18181b"; (e.currentTarget as HTMLAnchorElement).style.background = "#f1f5f9"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLAnchorElement).style.background = "#f8fafc"; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5" />
                  </svg>
                  <span style={{ flex: 1 }}>Request a Feature</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>

                <div style={{ fontSize: 12.5, color: "#64748b", paddingTop: 4 }}>
                  Still stuck?{" "}
                  <a href="mailto:hello@churnq.com" style={{ color: "#18181b", fontWeight: 600, textDecoration: "underline" }}>
                    Email us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
