"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SlackConnectCard({
  connected,
  channelName,
}: {
  connected: boolean;
  channelName?: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/slack/disconnect", { method: "POST" });
    router.refresh();
    setDisconnecting(false);
  }

  if (connected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--cs-border,#e2e8f0)", background: "#fff",
            color: "var(--cs-text-muted,#64748b)", cursor: disconnecting ? "not-allowed" : "pointer",
            opacity: disconnecting ? 0.6 : 1, fontFamily: "inherit",
          }}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect Slack"}
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/slack/connect"
      style={{
        display: "inline-flex", alignItems: "center",
        background: "#18181b", color: "#fff",
        padding: "8px 18px", borderRadius: 8,
        fontSize: 13, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em",
      }}
    >
      Authorize
    </a>
  );
}
