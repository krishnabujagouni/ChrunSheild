"use client";

import { useState } from "react";

type Platform = "zapier" | "make";

type ConnectedEndpoint = {
  id: string;
  url: string;
  secret: string;
};

const CONFIG: Record<Platform, {
  name: string;
  bg: string;
  logo: React.ReactNode;
  deepLink: string;
  instruction: string;
}> = {
  zapier: {
    name: "Zapier",
    bg: "#FF4A00",
    deepLink: "https://zapier.com/app/editor",
    instruction: "In Zapier: New Zap → Trigger → Webhooks by Zapier → Catch Hook → copy the URL Zapier gives you → paste it below.",
    logo: (
      /* Official Zapier "Z" logomark */
      <svg width="20" height="20" viewBox="0 0 300 300" fill="white">
        <path d="M174.9 150c0 6.2-.8 12.2-2.2 18H127.3a74 74 0 0 1-2.2-18c0-6.2.8-12.2 2.2-18h45.4c1.4 5.8 2.2 11.8 2.2 18ZM150 79.4a74 74 0 0 1 47.4 17.1l24-24A108 108 0 0 0 150 44a108 108 0 0 0-71.4 27.5l24 24A74 74 0 0 1 150 79.4Zm0 141.2a74 74 0 0 1-47.4-17.1l-24 24A108 108 0 0 0 150 256a108 108 0 0 0 71.4-27.5l-24-24A74 74 0 0 1 150 220.6ZM44 150c0 26 9.2 49.9 24.5 68.6l24-24A74 74 0 0 1 78 150c0-16.4 5.3-31.5 14.3-43.8l-24-24A108 108 0 0 0 44 150Zm212 0a108 108 0 0 0-24.3-67.8l-24 24A74 74 0 0 1 222 150a74 74 0 0 1-14.6 43.8l24 24A108 108 0 0 0 256 150Z" />
      </svg>
    ),
  },
  make: {
    name: "Make",
    bg: "#6D00CC",
    deepLink: "https://www.make.com/en/login",
    instruction: "In Make: New scenario → Webhooks module → Custom webhook → Create → copy the URL Make gives you → paste it below.",
    logo: (
      /* Official Make logomark — three filled circles in a triangle arrangement */
      <svg width="20" height="20" viewBox="0 0 300 300" fill="white">
        <circle cx="150" cy="80"  r="44" />
        <circle cx="72"  cy="210" r="44" />
        <circle cx="228" cy="210" r="44" />
        <line x1="150" y1="80"  x2="72"  y2="210" stroke="white" strokeWidth="22" strokeLinecap="round" />
        <line x1="150" y1="80"  x2="228" y2="210" stroke="white" strokeWidth="22" strokeLinecap="round" />
        <line x1="72"   y1="210" x2="228" y2="210" stroke="white" strokeWidth="22" strokeLinecap="round" />
      </svg>
    ),
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      style={{
        fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7,
        border: "1px solid var(--cs-border, #e4e4e7)", background: copied ? "#f0fdf4" : "#fff",
        color: copied ? "#16a34a" : "var(--cs-text, #18181b)", cursor: "pointer",
        fontFamily: "inherit", flexShrink: 0, transition: "all 0.15s",
      }}
    >
      {copied ? "Copied!" : "Copy URL"}
    </button>
  );
}

function PlatformCard({ platform, existingEndpoint }: { platform: Platform; existingEndpoint: ConnectedEndpoint | null }) {
  const cfg = CONFIG[platform];
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState<ConnectedEndpoint | null>(existingEndpoint);
  // Step 1: user opens Zapier/Make and gets a URL. Step 2: they paste it here.
  const [pastedUrl, setPastedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const isConnected = !!endpoint;

  async function handleSave() {
    setSaveError(null);
    if (!pastedUrl.trim()) { setSaveError("Paste the URL from " + cfg.name); return; }
    setSaving(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: pastedUrl.trim(),
        events: ["save.created", "high_risk.detected"],
        label: platform,
      }),
    });
    let data: Record<string, any> = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.ok && data.endpoint) {
      setEndpoint({ id: data.endpoint.id, url: data.endpoint.url, secret: data.endpoint.secret });
      setPastedUrl("");
    } else {
      setSaveError(data.error ?? `Server error (${res.status})`);
    }
    setSaving(false);
  }

  async function handleTest() {
    if (!endpoint) return;
    await fetch(`/api/webhooks/${endpoint.id}/test`, { method: "POST" });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }

  async function handleDisconnect() {
    if (!endpoint) return;
    setDisconnecting(true);
    await fetch(`/api/webhooks/${endpoint.id}`, { method: "DELETE" });
    setEndpoint(null);
    setOpen(false);
    setDisconnecting(false);
  }

  return (
    <>
      {/* Row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "20px 0",
        borderTop: "1px solid var(--cs-border, #e4e4e7)",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: cfg.bg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {cfg.logo}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 2 }}>
            {cfg.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)" }}>
            Automate actions in {platform === "zapier" ? "5,000+" : "1,500+"} apps whenever a subscriber is saved or flagged.
          </div>
          {isConnected && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>● Connected</span>
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          {isConnected ? (
            <button
              onClick={() => setOpen(v => !v)}
              style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--cs-border, #e2e8f0)", background: "#fff",
                color: "var(--cs-text-muted, #64748b)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {open ? "Close" : "Manage"}
            </button>
          ) : (
            <button
              onClick={() => setOpen(v => !v)}
              style={{
                display: "inline-flex", alignItems: "center",
                background: "#18181b", color: "#fff",
                padding: "8px 18px", borderRadius: 8,
                fontSize: 13, fontWeight: 600, border: "none",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{ borderTop: "1px solid var(--cs-border, #e4e4e7)", paddingTop: 20, paddingBottom: 24 }}>

          {!isConnected ? (
            /* ── Setup flow ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Step 1 — open platform */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Step n={1} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 6 }}>
                    Open {cfg.name} and create a webhook trigger
                  </div>
                  <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)", marginBottom: 10, lineHeight: 1.5 }}>
                    {cfg.instruction}
                  </div>
                  <a
                    href={cfg.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: cfg.bg, color: "#fff",
                      padding: "8px 16px", borderRadius: 8,
                      fontSize: 13, fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    Open {cfg.name}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Step 2 — paste URL */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Step n={2} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 8 }}>
                    Paste the webhook URL {cfg.name} gave you
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="url"
                      value={pastedUrl}
                      onChange={e => setPastedUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      placeholder={platform === "zapier" ? "https://hooks.zapier.com/hooks/catch/…" : "https://hook.eu1.make.com/…"}
                      style={{
                        flex: 1, fontSize: 13, padding: "9px 12px", borderRadius: 8,
                        border: "1px solid var(--cs-border, #e4e4e7)",
                        background: "#fff", color: "var(--cs-text, #18181b)",
                        fontFamily: "inherit", outline: "none",
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        fontSize: 13, fontWeight: 600, padding: "9px 18px", borderRadius: 8,
                        background: saving ? "#52525b" : "#18181b", color: "#fff",
                        border: "none", cursor: saving ? "not-allowed" : "pointer",
                        fontFamily: "inherit", flexShrink: 0,
                      }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {saveError && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{saveError}</div>}
                </div>
              </div>
            </div>
          ) : (
            /* ── Connected state ── */
            <div style={{
              border: "1px solid var(--cs-border, #e4e4e7)",
              borderRadius: 10, overflow: "hidden",
            }}>
              {/* Endpoint row — same style as webhook endpoint list */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                background: "#fff",
                borderBottom: "1px solid var(--cs-border, #e4e4e7)",
              }}>
                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#22c55e", flexShrink: 0,
                }} />
                <code style={{
                  fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "var(--cs-text, #18181b)", fontFamily: "monospace", fontWeight: 500,
                }}>
                  {endpoint.url}
                </code>
                <CopyButton text={endpoint.url} />
              </div>

              {/* Actions row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px",
                background: "var(--cs-bg, #fafafa)",
              }}>
                <button
                  onClick={handleTest}
                  style={{
                    fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 7,
                    border: "1px solid var(--cs-border, #e2e8f0)",
                    background: testSent ? "#f0fdf4" : "#fff",
                    color: testSent ? "#16a34a" : "var(--cs-text, #18181b)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {testSent ? "✓ Test sent" : "Send test event"}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  style={{
                    fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 7,
                    border: "1px solid #fecaca", background: "#fff",
                    color: "#ef4444", cursor: disconnecting ? "not-allowed" : "pointer",
                    fontFamily: "inherit", opacity: disconnecting ? 0.5 : 1,
                  }}
                >
                  {disconnecting ? "Disconnecting…" : `Disconnect ${cfg.name}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: "50%", background: "#18181b",
      color: "#fff", fontSize: 11, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
    }}>
      {n}
    </div>
  );
}

export function ZapierMakeSection({
  zapierEndpoint,
  makeEndpoint,
}: {
  zapierEndpoint: ConnectedEndpoint | null;
  makeEndpoint: ConnectedEndpoint | null;
}) {
  return (
    <>
      <PlatformCard platform="zapier" existingEndpoint={zapierEndpoint} />
      <PlatformCard platform="make" existingEndpoint={makeEndpoint} />
    </>
  );
}
