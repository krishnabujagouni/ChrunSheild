import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyConnectState } from "@/lib/connect-state";

function appOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return new URL(request.url).origin;
}

/** Discord OAuth redirect_uri — exchanges code, saves webhook URL + channel name on the tenant. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appOrigin(request);
  const settingsUrl = new URL("/dashboard/settings", base);

  const err = url.searchParams.get("error");
  if (err) {
    settingsUrl.searchParams.set("discord_error", err);
    return NextResponse.redirect(settingsUrl);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const tenantId = verifyConnectState(state);
  if (!code || !tenantId) {
    settingsUrl.searchParams.set("discord_error", "invalid_callback");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    settingsUrl.searchParams.set("discord_error", "discord_not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  // Exchange code for token
  let tokenData: { error?: string; webhook?: { url: string; name: string; channel_id: string } };
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    settingsUrl.searchParams.set("discord_error", "token_exchange_failed");
    return NextResponse.redirect(settingsUrl);
  }

  if (tokenData.error || !tokenData.webhook?.url) {
    settingsUrl.searchParams.set("discord_error", tokenData.error ?? "oauth_failed");
    return NextResponse.redirect(settingsUrl);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      discordWebhookUrl: tokenData.webhook.url,
      discordChannelName: tokenData.webhook.name,
    },
  });

  settingsUrl.searchParams.set("discord_connected", "1");
  return NextResponse.redirect(settingsUrl);
}
