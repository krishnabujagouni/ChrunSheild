"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  "save.created":       "Subscriber retained",
  "high_risk.detected": "High-risk detected",
};
const ALL_EVENTS = Object.keys(EVENT_LABELS);

const LOG_EVENT_LABELS: Record<string, string> = {
  "save.created":       "Subscriber retained",
  "high_risk.detected": "High-risk detected",
  "webhook.test":       "Test",
};

type DeliveryItem = {
  id: string;
  event: string;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  responsePreview: string | null;
  payload: string;
  attempts: number;
  durationMs: number | null;
  isTest: boolean;
  createdAt: string;
};

type LogsResponse = {
  endpointUrl: string;
  items: DeliveryItem[];
  counts: { all: number; delivered: number; failed: number };
  config: { timeoutSeconds: number; maxAttempts: number; retentionDays: number };
};

function formatRelativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function shortDeliveryId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 9);
}

function DeliveryLogsDrawer({ endpointId, onClose }: { endpointId: string; onClose: () => void }) {
  const [tab, setTab] = useState<"all" | "delivered" | "failed">("all");
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [panelIn, setPanelIn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPanelIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const q = tab === "all" ? "" : `?status=${tab}`;
    const res = await fetch(`/api/webhooks/${endpointId}/deliveries${q}`);
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Failed to load logs");
      setData(null);
    } else {
      setData(json as LogsResponse);
    }
    setLoading(false);
  }, [endpointId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(deliveryId: string) {
    setResendingId(deliveryId);
    await fetch(`/api/webhooks/${endpointId}/deliveries/${deliveryId}/resend`, { method: "POST" });
    await load();
    setResendingId(null);
  }

  const counts = data?.counts;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-logs-title"
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        display: "flex", justifyContent: "flex-end",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        aria-label="Close delivery logs"
        onClick={onClose}
        style={{
          flex: 1, minWidth: 48, border: "none", padding: 0, margin: 0,
          cursor: "pointer", background: panelIn ? "rgba(0,0,0,0.35)" : "transparent",
          transition: "background 0.28s ease",
        }}
      />
      <div style={{
        width: "min(440px, 100vw)",
        height: "100%",
        maxHeight: "100dvh",
        background: "#fff",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        transform: panelIn ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        flexShrink: 0,
      }}>
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #e4e4e7", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div id="delivery-logs-title" style={{ fontSize: 17, fontWeight: 700, color: "#18181b", marginBottom: 6, letterSpacing: "-0.02em" }}>
                Delivery logs
              </div>
              <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.45, wordBreak: "break-all" }}>
                {data?.endpointUrl ?? "…"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent",
                cursor: "pointer", color: "#71717a", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setTab("all")}
              style={tabPill(tab === "all", true)}
            >
              All{counts != null ? ` ${counts.all}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setTab("delivered")}
              style={tabPill(tab === "delivered", true)}
            >
              Delivered{counts != null ? ` ${counts.delivered}` : ""}
            </button>
            <span style={tabPill(false, false)}>Pending</span>
            <span style={tabPill(false, false)}>Retrying</span>
            <button
              type="button"
              onClick={() => setTab("failed")}
              style={tabPill(tab === "failed", true)}
            >
              Errors{counts != null ? ` ${counts.failed}` : ""}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px", minHeight: 0 }}>
          {loading && (
            <div style={{ padding: 16, fontSize: 13, color: "#71717a" }}>Loading…</div>
          )}
          {!loading && err && (
            <div style={{ padding: 16, fontSize: 13, color: "#ef4444" }}>{err}</div>
          )}
          {!loading && !err && data && data.items.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "#71717a", lineHeight: 1.5 }}>
              No deliveries in the last {data.config.retentionDays} days.
            </div>
          )}
          {!loading && !err && data?.items.map(row => {
            const ok = row.status === "delivered";
            const open = expandedId === row.id;
            const title = LOG_EVENT_LABELS[row.event] ?? row.event;
            return (
              <div
                key={row.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  marginBottom: 12,
                  background: "#fafafa",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "14px 16px", cursor: "pointer", background: "#fff",
                  }}
                  onClick={() => setExpandedId(open ? null : row.id)}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                    background: ok ? "#22c55e" : "#ef4444",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", lineHeight: 1.35 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>{title}</span>
                      <span style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "ui-monospace, monospace" }}>
                        {shortDeliveryId(row.id)}
                      </span>
                      {row.isTest && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                          background: "#f4f4f5", color: "#71717a", border: "1px solid #e4e4e7",
                        }}>
                          Test
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a", marginTop: 6 }}>
                      {formatRelativeTime(row.createdAt)}
                      {row.httpStatus != null ? ` · ${row.httpStatus}` : ""}
                      {!ok && row.errorMessage ? ` · ${row.errorMessage}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Details"
                      onClick={e => { e.stopPropagation(); setExpandedId(open ? null : row.id); }}
                      style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        padding: 6, color: "#a1a1aa",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); void resend(row.id); }}
                      disabled={resendingId === row.id}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8,
                        border: "1px solid #e4e4e7", background: "#fff",
                        color: "#18181b", cursor: resendingId === row.id ? "wait" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      {resendingId === row.id ? "…" : "Resend"}
                    </button>
                  </div>
                </div>
                {open && (
                  <div style={{ padding: "0 16px 14px 36px", fontSize: 11, color: "#52525b", borderTop: "1px solid #f4f4f5", background: "#fff" }}>
                    <pre style={{
                      margin: "12px 0 0", padding: 12, background: "#f4f4f5", borderRadius: 8,
                      overflow: "auto", maxHeight: 180, fontSize: 11, lineHeight: 1.45,
                    }}>
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(row.payload), null, 2);
                        } catch {
                          return row.payload;
                        }
                      })()}
                    </pre>
                    {row.responsePreview ? (
                      <div style={{ marginTop: 10 }}>
                        <span style={{ fontWeight: 600 }}>Response preview</span>
                        <pre style={{
                          margin: "6px 0 0", padding: 10, background: "#fafafa", borderRadius: 8,
                          overflow: "auto", maxHeight: 88, fontSize: 11,
                        }}>
                          {row.responsePreview}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {data && (
          <div style={{
            padding: "14px 24px 20px", borderTop: "1px solid #e4e4e7",
            fontSize: 11, color: "#71717a", flexShrink: 0, lineHeight: 1.55, background: "#fff",
          }}>
            Timeout {data.config.timeoutSeconds}s • {data.config.maxAttempts} attempts max • Logs older than {data.config.retentionDays} days are auto-deleted
          </div>
        )}
      </div>
    </div>
  );
}

function tabPill(active: boolean, interactive: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid #e4e4e7",
    background: active ? "#18181b" : "#fff",
    color: active ? "#fff" : interactive ? "#64748b" : "#a1a1aa",
    cursor: interactive ? "pointer" : "default",
    fontFamily: "inherit",
    opacity: interactive ? 1 : 0.85,
    boxSizing: "border-box",
  };
}

/* ── tiny icon SVGs ─────────────────────────────────────────────────── */
const IconCopy = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconPlay = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

/* ── toggle switch ──────────────────────────────────────────────────── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 99, border: "none", cursor: "pointer",
        background: on ? "#22c55e" : "#d1d5db",
        position: "relative", flexShrink: 0, transition: "background 0.2s",
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2,
        left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

/* ── icon button ────────────────────────────────────────────────────── */
function IconBtn({ onClick, title, children, danger }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        background: "none", border: "none", cursor: "pointer", borderRadius: 6,
        color: danger ? "#ef4444" : "var(--cs-text-muted, #71717a)",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? "#fef2f2" : "var(--cs-bg, #f4f4f5)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
    >
      {children}
    </button>
  );
}

export function WebhooksSection({ initial }: { initial: Endpoint[] }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initial);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(ALL_EVENTS);
  const [showEvents, setShowEvents] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [logsEndpointId, setLogsEndpointId] = useState<string | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setSelectedEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  }

  async function handleAdd() {
    setError(null);
    if (!url.trim()) { setError("URL is required"); return; }
    setAdding(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), events: selectedEvents }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to add endpoint");
    } else {
      setEndpoints(prev => [...prev, json.endpoint]);
      setUrl("");
      setSelectedEvents(ALL_EVENTS);
      setShowEvents(false);
      setShowSecret(false);
    }
    setAdding(false);
  }

  async function handleToggle(id: string, enabled: boolean) {
    setEndpoints(prev => prev.map(e => e.id === id ? { ...e, enabled } : e));
    const res = await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      // rollback
      setEndpoints(prev => prev.map(e => e.id === id ? { ...e, enabled: !enabled } : e));
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    setEndpoints(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  async function handleTest(ep: Endpoint) {
    setTestingId(ep.id);
    await fetch(`/api/webhooks/${ep.id}/test`, { method: "POST" });
    setTimeout(() => setTestingId(null), 1500);
  }

  function copySigningSecret(id: string, secret: string) {
    navigator.clipboard.writeText(secret).then(() => {
      setCopiedSecretId(id);
      setTimeout(() => setCopiedSecretId(null), 1500);
    });
  }

  /* ── Row in the integration list card ── */
  return (
    <>
      <div
        id="churnshield-webhooks"
        style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "20px 0",
        borderTop: "1px solid var(--cs-border, #e4e4e7)",
      }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: "#18181b",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 2 }}>Webhooks</div>
          <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)" }}>
            Send real-time HTTP POST events to any URL — paste a{" "}
            <strong style={{ fontWeight: 600, color: "var(--cs-text, #52525b)" }}>Zapier Catch Hook</strong> URL, or use
            HubSpot and custom endpoints.
          </div>
          {endpoints.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
                ● {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""} connected
              </span>
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          {open ? (
            <button onClick={() => { setOpen(false); setError(null); }} style={closeBtn}>Close</button>
          ) : endpoints.length > 0 ? (
            <button onClick={() => setOpen(true)} style={closeBtn}>Manage</button>
          ) : (
            <button onClick={() => setOpen(true)} style={connectBtn}>Connect</button>
          )}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {open && (
        <div style={{ borderTop: "1px solid var(--cs-border, #e4e4e7)", paddingBottom: 24, paddingTop: 20 }}>

          {/* Title */}
          <div style={{ marginBottom: 4, fontSize: 18, fontWeight: 700, color: "var(--cs-text, #18181b)", letterSpacing: "-0.02em" }}>
            Manage webhooks
          </div>
          <div style={{ fontSize: 13, color: "var(--cs-text-muted, #71717a)", marginBottom: 18 }}>
            Add webhook endpoints to receive ChurnShield events in real time.
          </div>

          {/* URL input + Add button */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                color: "var(--cs-text-muted, #94a3b8)", display: "flex",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </span>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="https://hooks.zapier.com/hooks/catch/… or your URL"
                style={{
                  width: "100%", boxSizing: "border-box",
                  fontSize: 13, padding: "10px 12px 10px 34px",
                  borderRadius: 9, border: "1px solid var(--cs-border, #e4e4e7)",
                  background: "#fff", color: "var(--cs-text, #18181b)",
                  fontFamily: "inherit", outline: "none",
                }}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              style={{
                ...connectBtn,
                padding: "10px 20px", borderRadius: 9, whiteSpace: "nowrap",
                opacity: adding ? 0.6 : 1, cursor: adding ? "not-allowed" : "pointer",
              }}
            >
              {adding ? "Adding…" : "+ Add webhook"}
            </button>
          </div>

          {/* Secondary options row */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: error ? 8 : 18, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowEvents(v => !v)}
              style={linkBtn}
            >
              {showEvents ? "− Events" : "+ Events"}
            </button>
            <span style={{ color: "var(--cs-border, #d1d5db)", margin: "0 8px" }}>•</span>
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              style={linkBtn}
            >
              {showSecret ? "− Signing secret" : "+ Signing secret"}
            </button>
          </div>

          {/* Events expandable */}
          {showEvents && (
            <div style={{ display: "flex", gap: 18, marginBottom: 14, paddingLeft: 2 }}>
              {ALL_EVENTS.map(event => (
                <label key={event} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    style={{ accentColor: "#18181b", width: 13, height: 13 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--cs-text, #18181b)", fontWeight: 500 }}>
                    {EVENT_LABELS[event]}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Signing secret info */}
          {showSecret && (
            <div style={{
              fontSize: 12, color: "var(--cs-text-muted, #71717a)", marginBottom: 14,
              background: "var(--cs-bg, #f4f4f5)", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6,
            }}>
              A unique <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>whsec_...</code> signing secret is auto-generated per endpoint.
              Verify requests using the <code style={{ background: "#e4e4e7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>X-ChurnShield-Signature</code> header (HMAC-SHA256).
              While this section is open, each endpoint’s full secret is listed below its URL.
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{error}</div>}

          {/* ENDPOINTS list */}
          {endpoints.length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "var(--cs-text-muted, #71717a)",
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
              }}>
                Endpoints
              </div>
              <div style={{
                border: "1px solid var(--cs-border, #e4e4e7)",
                borderRadius: 10, overflow: "hidden",
              }}>
                {endpoints.map((ep, i) => (
                  <div
                    key={ep.id}
                    style={{
                      padding: showSecret ? "12px 14px 14px" : "12px 14px",
                      borderBottom: i < endpoints.length - 1 ? "1px solid var(--cs-border, #e4e4e7)" : "none",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Toggle on={ep.enabled} onChange={v => handleToggle(ep.id, v)} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, color: "var(--cs-text, #18181b)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          fontWeight: 500,
                        }}>
                          {ep.url}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setLogsEndpointId(ep.id)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8,
                            border: "1px solid var(--cs-border, #e4e4e7)", background: "#fff",
                            color: "var(--cs-text, #18181b)", cursor: "pointer", fontFamily: "inherit",
                            marginRight: 4,
                          }}
                        >
                          View logs
                        </button>

                        <IconBtn onClick={() => handleTest(ep)} title="Send test event">
                          {testingId === ep.id ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : <IconPlay />}
                        </IconBtn>

                        <IconBtn onClick={() => handleDelete(ep.id)} title="Remove endpoint" danger>
                          {deletingId === ep.id ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10" />
                            </svg>
                          ) : <IconTrash />}
                        </IconBtn>
                      </div>
                    </div>

                    {showSecret && (
                      <div style={{ marginTop: 10, marginLeft: 48 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: "var(--cs-text-muted, #71717a)",
                          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
                        }}>
                          Signing secret
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            readOnly
                            value={ep.secret}
                            aria-label="Signing secret"
                            onFocus={e => e.target.select()}
                            onClick={e => (e.target as HTMLInputElement).select()}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 12,
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                              padding: "8px 11px",
                              borderRadius: 8,
                              border: "1px solid var(--cs-border, #e4e4e7)",
                              background: "var(--cs-bg, #f4f4f5)",
                              color: "var(--cs-text, #18181b)",
                              outline: "none",
                              boxSizing: "border-box",
                              overflowX: "auto",
                            }}
                          />
                          <IconBtn
                            onClick={() => copySigningSecret(ep.id, ep.secret)}
                            title={copiedSecretId === ep.id ? "Copied!" : "Copy signing secret"}
                          >
                            {copiedSecretId === ep.id ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <IconCopy />
                            )}
                          </IconBtn>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {logsEndpointId && (
        <DeliveryLogsDrawer endpointId={logsEndpointId} onClose={() => setLogsEndpointId(null)} />
      )}
    </>
  );
}

/* ── shared button styles ─────────────────────────────────────────── */
const connectBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
  background: "#18181b", color: "#fff",
  padding: "8px 18px", borderRadius: 8,
  fontSize: 13, fontWeight: 600, border: "none",
  cursor: "pointer", fontFamily: "inherit",
};

const closeBtn: React.CSSProperties = {
  fontSize: 12, padding: "6px 14px", borderRadius: 8,
  border: "1px solid var(--cs-border, #e2e8f0)", background: "#fff",
  color: "var(--cs-text-muted, #64748b)", cursor: "pointer", fontFamily: "inherit",
};

const linkBtn: React.CSSProperties = {
  fontSize: 12, background: "none", border: "none", cursor: "pointer",
  color: "var(--cs-text-muted, #71717a)", padding: 0, fontFamily: "inherit",
  fontWeight: 500,
};
