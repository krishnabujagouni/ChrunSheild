import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyConnectState } from "@/lib/connect-state";
import { getStripe } from "@/lib/stripe-server";

function appOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return new URL(request.url).origin;
}

/** Stripe Connect OAuth redirect_uri  exchanges `code`, saves `stripe_connect_id` on the tenant. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  const base = appOrigin(request);

  if (err) {
    const u = new URL("/dashboard/settings", base);
    u.searchParams.set("stripe_error", err);
    if (errDesc) u.searchParams.set("stripe_error_description", errDesc);
    return NextResponse.redirect(u);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const tenantId = verifyConnectState(state);
  if (!code || !tenantId) {
    return NextResponse.json({ error: "invalid_callback" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let stripeUserId: string;
  try {
    const stripe = getStripe();
    const token = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });
    stripeUserId = token.stripe_user_id as string;
    if (!stripeUserId) {
      return NextResponse.json({ error: "no_stripe_user_id" }, { status: 502 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_token_failed";
    return NextResponse.json({ error: "oauth_token_failed", message }, { status: 502 });
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeConnectId: stripeUserId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "stripe_account_already_linked" }, { status: 409 });
    }
    throw e;
  }

  const u = new URL("/dashboard/settings", base);
  u.searchParams.set("stripe_connected", "1");
  return NextResponse.redirect(u);
}
