import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyConnectState } from "@/lib/connect-state";

function appOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return new URL(request.url).origin;
}

/** Slack OAuth redirect_uri — exchanges code, saves webhook URL + channel name on the tenant. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appOrigin(request);
  const settingsUrl = new URL("/dashboard/settings", base);

  const err = url.searchParams.get("error");
  if (err) {
    settingsUrl.searchParams.set("slack_error", err);
    return NextResponse.redirect(settingsUrl);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const tenantId = verifyConnectState(state);
  if (!code || !tenantId) {
    settingsUrl.searchParams.set("slack_error", "invalid_callback");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    settingsUrl.searchParams.set("slack_error", "slack_not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  // Exchange code for access token
  let tokenData: { ok: boolean; error?: string; incoming_webhook?: { url: string; channel: string } };
  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ code, redirect_uri: redirectUri }).toString(),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    settingsUrl.searchParams.set("slack_error", "token_exchange_failed");
    return NextResponse.redirect(settingsUrl);
  }

  if (!tokenData.ok || !tokenData.incoming_webhook?.url) {
    settingsUrl.searchParams.set("slack_error", tokenData.error ?? "oauth_failed");
    return NextResponse.redirect(settingsUrl);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      slackWebhookUrl: tokenData.incoming_webhook.url,
      slackChannelName: tokenData.incoming_webhook.channel,
    },
  });

  settingsUrl.searchParams.set("slack_connected", "1");
  return NextResponse.redirect(settingsUrl);
}
