"use client";

import { useState } from "react";

/** Logged-in users land on Zaps; use Create to add Webhooks by Zapier → Catch Hook. */
const ZAP_DASHBOARD = "https://zapier.com/app/zaps";

export function ZapierConnectRow() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "20px 0",
        borderTop: "1px solid var(--cs-border, #e4e4e7)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "#FF4F00",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M10.5 8.5h5.2L8 23.5h8.5l2.8-6.2 3.2 6.2H28l-7.5-15h-5.8l-2.5 5.1-1.7-5.1z"
              fill="white"
            />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 2 }}>
            Zapier
          </div>
          <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)", lineHeight: 1.5 }}>
            Automate ChurnQ events in 5,000+ apps using{" "}
            <strong style={{ fontWeight: 600, color: "var(--cs-text, #3f3f46)" }}>Webhooks by Zapier</strong> (Catch Hook).
            No separate Zapier app required  we POST signed JSON to your hook URL.
          </div>
        </div>

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <a
            href={ZAP_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#FF4F00",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Open Zapier
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <button
            type="button"
            onClick={() => setGuideOpen(v => !v)}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--cs-border, #e2e8f0)",
              background: "#fff",
              color: "var(--cs-text-muted, #64748b)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 500,
            }}
          >
            {guideOpen ? "Hide setup guide" : "Setup guide"}
          </button>
        </div>
      </div>

      {guideOpen && (
        <div
          style={{
            marginTop: 16,
            marginLeft: 60,
            padding: "14px 16px",
            background: "var(--cs-bg, #f4f4f5)",
            borderRadius: 10,
            border: "1px solid var(--cs-border, #e4e4e7)",
            fontSize: 12,
            color: "var(--cs-text, #3f3f46)",
            lineHeight: 1.65,
          }}
        >
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 8 }}>
              In Zapier, create a Zap and pick <strong>Webhooks by Zapier</strong> → <strong>Catch Hook</strong> as the
              trigger.
            </li>
            <li style={{ marginBottom: 8 }}>
              Copy the <strong>Custom Webhook URL</strong> (starts with{" "}
              <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>
                https://hooks.zapier.com/hooks/catch/
              </code>
              ).
            </li>
            <li style={{ marginBottom: 8 }}>
              In ChurnQ, open the{" "}
              <a href="#ChurnQ-webhooks" style={{ color: "#c2410c", fontWeight: 600, textDecoration: "none" }}>
                Webhooks
              </a>{" "}
              section (next row), click <strong>Connect</strong> or <strong>Manage</strong>, paste that URL, choose
              events, then add the endpoint.
            </li>
            <li style={{ marginBottom: 8 }}>
              In Zapier, run <strong>Test trigger</strong>. In ChurnQ, use <strong>Send test</strong> on the endpoint
              so Zapier can sample the payload fields.
            </li>
            <li>
              Add Zapier actions (Sheets, HubSpot, email, etc.). Payload shape:{" "}
              <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>event</code>,{" "}
              <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>timestamp</code>,{" "}
              <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>data</code> (JSON
              body). Optional verification: header{" "}
              <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>
                X-ChurnQ-Signature
              </code>{" "}
              (HMAC-SHA256 of the raw body)  use a Code step if you need to verify it.
            </li>
          </ol>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cs-border, #e4e4e7)" }}>
            <a
              href="https://zapier.com/apps/webhook/help"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#c2410c", fontWeight: 600, textDecoration: "none" }}
            >
              Zapier: Webhooks help →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
