import React from "react";
import type { CSSProperties } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { SlackConnectCard } from "@/app/dashboard/settings/slack-connect-card";
import { DiscordConnectCard } from "@/app/dashboard/settings/discord-connect-card";
import { WebhooksSection } from "./webhooks-section";
import { ZapierMakeSection } from "./zapier-make-card";
import { StripeProductTags } from "./stripe-product-tags";

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "20px 0",
  borderBottom: "1px solid var(--cs-border, #e4e4e7)",
};

const iconWrap = (bg: string): CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: bg,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

function ConnectedBadge({ channel }: { channel?: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
        ● Connected{channel ? ` · ${channel}` : ""}
      </span>
    </div>
  );
}

export default async function ConnectionsPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId }, include: { webhookEndpoints: { orderBy: { createdAt: "asc" } } } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId }, include: { webhookEndpoints: { orderBy: { createdAt: "asc" } } } });

  if (!tenant) redirect("/dashboard");

  const zapierEp = tenant.webhookEndpoints.find(e => e.label === "zapier") ?? null;
  const makeEp   = tenant.webhookEndpoints.find(e => e.label === "make")   ?? null;
  const genericEndpoints = tenant.webhookEndpoints.filter(e => !e.label);

  return (
    <div style={{ fontFamily: "var(--cs-font, var(--font-inter, 'Inter', system-ui, sans-serif))" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--cs-text, #18181b)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Integrate with your favorite tools
        </h1>
      </div>

      {/* "Not seeing what you need" banner */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--cs-surface, #fff)",
        border: "1px solid var(--cs-border, #e4e4e7)",
        borderRadius: 12, padding: "18px 22px", marginBottom: 28, gap: 16,
        boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(24,24,27,0.04))",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 3 }}>
            Not seeing an integration you need?
          </div>
          <div style={{ fontSize: 13, color: "var(--cs-text-muted, #71717a)" }}>
            Tell us what you want to connect next and we will prioritize it based on demand.
          </div>
        </div>
        <a
          href="mailto:hello@churnq.com?subject=Integration request"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--cs-text, #18181b)", color: "#fff",
            padding: "9px 18px", borderRadius: 9,
            fontSize: 13, fontWeight: 600, textDecoration: "none",
            flexShrink: 0, letterSpacing: "-0.01em",
          }}
        >
          Request an integration
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
        </a>
      </div>

      {/* Integration list */}
      <div style={{
        background: "var(--cs-surface, #fff)",
        border: "1px solid var(--cs-border, #e4e4e7)",
        borderRadius: 12,
        boxShadow: "var(--cs-shadow-sm, 0 1px 2px rgba(24,24,27,0.04))",
        padding: "0 22px",
      }}>

        {/* ── Stripe ── */}
        <div style={row}>
          <div style={iconWrap("#635bff")}>
            <svg width="18" height="18" viewBox="0 0 60 60" fill="none">
              <path d="M27.7 22.8c0-2 1.6-2.8 4.3-2.8 3.8 0 8.7 1.2 12.5 3.3V11.6C40.4 9.7 36.3 9 32.1 9 22.6 9 16 14 16 23.3c0 14.2 19.6 11.9 19.6 18.1 0 2.4-2 3.1-4.9 3.1-4.2 0-9.7-1.8-14-4.2v11.9C20.5 54 24.8 55 29.2 55c9.7 0 16.8-4.8 16.8-14.2C46 25.8 27.7 28.5 27.7 22.8z" fill="white" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)" }}>Stripe Connect</span>
              <span style={{ fontSize: 10, fontWeight: 600, background: "#fef3c7", color: "#92400e", padding: "1px 7px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" }}>Required</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)" }}>
              Apply discounts, pause subscriptions, and charge the 15% save fee automatically.
            </div>
            {tenant.stripeConnectId && (
              <div style={{ marginTop: 4 }}>
                <ConnectedBadge />
                <StripeProductTags />
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {tenant.stripeConnectId && (
              <a href="/api/stripe/connect/start" style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)", textDecoration: "none", fontWeight: 500 }}>
                Reconnect →
              </a>
            )}
            {!tenant.stripeConnectId && (
              <a
                href="/api/stripe/connect/start"
                style={{
                  display: "inline-flex", alignItems: "center",
                  background: "var(--cs-text, #18181b)", color: "#fff",
                  padding: "8px 18px", borderRadius: 8,
                  fontSize: 13, fontWeight: 600, textDecoration: "none",
                }}
              >
                Connect
              </a>
            )}
          </div>
        </div>

        {/* ── Slack ── */}
        <div style={row}>
          <div style={iconWrap("#4A154B")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 2 }}>Slack</div>
            <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)" }}>
              Get notified in Slack when a subscriber is saved or flagged as high-risk.
            </div>
            {tenant.slackWebhookUrl && (
              <div style={{ marginTop: 4 }}>
                <ConnectedBadge channel={tenant.slackChannelName} />
              </div>
            )}
            {!tenant.slackWebhookUrl && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--cs-text-muted, #94a3b8)" }}>
                Tip: create a <code style={{ background: "var(--cs-bg, #f4f4f5)", padding: "1px 5px", borderRadius: 4 }}>#ChurnQ-alerts</code> channel first.
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <SlackConnectCard connected={!!tenant.slackWebhookUrl} channelName={tenant.slackChannelName} />
          </div>
        </div>

        {/* ── Discord ── */}
        <div style={row}>
          <div style={iconWrap("#5865F2")}>
            <svg width="19" height="14" viewBox="0 0 71 55" fill="white">
              <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.7 37.7 0 0 0 25.6.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.1-.9 31 .3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.8a.2.2 0 0 1 .2 0c11.5 5.2 24 5.2 35.3 0a.2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .3 36 36 0 0 1-5.6 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2C72.9 29.1 69.4 16.3 60.2 5a.2.2 0 0 0-.1-.1ZM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 3.9-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 3.9-2.8 7.2-6.4 7.2Z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cs-text, #18181b)", marginBottom: 2 }}>Discord</div>
            <div style={{ fontSize: 12, color: "var(--cs-text-muted, #71717a)" }}>
              Get notified in Discord when a subscriber is saved or flagged as high-risk.
            </div>
            {tenant.discordWebhookUrl && (
              <div style={{ marginTop: 4 }}>
                <ConnectedBadge channel={tenant.discordChannelName ? `#${tenant.discordChannelName}` : null} />
              </div>
            )}
            {!tenant.discordWebhookUrl && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--cs-text-muted, #94a3b8)" }}>
                Tip: create a <code style={{ background: "var(--cs-bg, #f4f4f5)", padding: "1px 5px", borderRadius: 4 }}>ChurnQ-alerts</code> channel in your server first.
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <DiscordConnectCard connected={!!tenant.discordWebhookUrl} channelName={tenant.discordChannelName} />
          </div>
        </div>

        {/* ── Zapier + Make ── */}
        <ZapierMakeSection
          zapierEndpoint={zapierEp ? { id: zapierEp.id, url: zapierEp.url, secret: zapierEp.secret } : null}
          makeEndpoint={makeEp   ? { id: makeEp.id,   url: makeEp.url,   secret: makeEp.secret   } : null}
        />

        {/* ── Custom Webhooks ── */}
        <WebhooksSection initial={genericEndpoints.map(ep => ({
          id: ep.id,
          url: ep.url,
          events: ep.events,
          secret: ep.secret,
          enabled: ep.enabled,
          createdAt: ep.createdAt.toISOString(),
        }))} />

      </div>

    </div>
  );
}
