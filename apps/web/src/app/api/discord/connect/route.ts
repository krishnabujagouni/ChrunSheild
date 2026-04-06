import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signConnectState } from "@/lib/connect-state";

/** Starts Discord OAuth to install an incoming webhook for the authenticated merchant. */
export async function GET(request: Request) {
  const { userId, orgId } = auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    const u = new URL("/dashboard/settings", request.url);
    u.searchParams.set("error", "discord_not_configured");
    return NextResponse.redirect(u);
  }

  const state = signConnectState(tenant.id);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "webhook.incoming",
    state,
  });

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.search = params.toString();
  return NextResponse.redirect(authorizeUrl);
}
