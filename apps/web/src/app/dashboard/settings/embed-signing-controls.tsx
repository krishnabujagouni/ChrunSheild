"use client";

import { useState } from "react";

type Props = {
  embedAppId: string;
  snippetKey: string;
  activated: boolean;
};

async function readJsonBody(r: Response): Promise<Record<string, unknown> | null> {
  const text = await r.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const NEXT_HMAC_ROUTE = `// app/api/churnshield-auth/route.ts  on your app
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.CHURNSHIELD_EMBED_SECRET;
  if (!secret) return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  const { subscriberId } = await req.json();
  const cus = typeof subscriberId === "string" ? subscriberId.trim() : "";
  if (!cus.startsWith("cus_")) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // TODO: ensure cus matches signed-in user
  const authHash = crypto.createHmac("sha256", secret).update(cus).digest("hex");
  return NextResponse.json({ authHash });
}`;

export function EmbedSigningControls({ embedAppId, snippetKey, activated: initialActivated }: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activated, setActivated] = useState(initialActivated);

  async function rotate() {
    setErr(null);
    setBusy(true);
    setSecret(null);
    try {
      const r = await fetch("/api/dashboard/embed-hmac", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });
      const d = await readJsonBody(r);
      if (!r.ok || !d) {
        setErr(String(d?.error ?? `request failed (${r.status})`));
        return;
      }
      if (typeof d.secret === "string") {
        setSecret(d.secret);
        setActivated(true);
      } else {
        setErr("invalid_response");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Server signing</h3>
        {activated ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#166534", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 99, padding: "2px 8px" }}>
            Secured
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 99, padding: "2px 8px" }}>
            Unsecured
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
        Store the embed secret as <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>CHURNSHIELD_EMBED_SECRET</code> on your
        server. Return HMAC-SHA256(secret, <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>subscriberId</code>) as{" "}
        <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>authHash</code> from your auth endpoint (same ID as in{" "}
        <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>identify</code>).
      </p>
      <div style={{ fontSize: 12, color: "#0f172a", marginBottom: 12, lineHeight: 1.6 }}>
        <div>
          <span style={{ color: "#64748b" }}>App ID </span>
          <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{embedAppId || ""}</code>
        </div>
        <div style={{ marginTop: 4 }}>
          <span style={{ color: "#64748b" }}>Snippet key </span>
          <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{snippetKey || ""}</code>
        </div>
      </div>
      {err && <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => void rotate()}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Rotate embed secret
        </button>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          After rotating, update <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>CHURNSHIELD_EMBED_SECRET</code> on every
          server.
        </span>
      </div>
      {secret && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e" }}>Copy once  update your servers</div>
            <button
              type="button"
              onClick={() => setSecret(null)}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #d97706",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
          <code style={{ fontSize: 11, wordBreak: "break-all", color: "#0f172a", display: "block" }}>{secret}</code>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#a16207" }}>
            Dismiss only hides this banner. Your new secret is already saved; we cannot show it again here.
          </p>
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: "#475569", cursor: "pointer", fontWeight: 500 }}>
          Example: Next.js POST route
        </summary>
        <pre
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 11,
            overflowX: "auto",
            margin: "10px 0 0",
            color: "#334155",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {NEXT_HMAC_ROUTE}
        </pre>
      </details>
    </div>
  );
}
