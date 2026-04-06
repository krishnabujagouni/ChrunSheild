import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/db";
import { generateEmbedAppId, generateEmbedHmacSecret } from "@/lib/tenant-embed";

type ClerkUserCreatedEvent = {
  type: "user.created";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
  };
};

type ClerkOrgCreatedEvent = {
  type: "organization.created";
  data: {
    id: string;
    name: string;
    created_by: string; // user id
  };
};

type ClerkUserUpdatedEvent = {
  type: "user.updated";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
  };
};

type ClerkEvent = ClerkUserCreatedEvent | ClerkUserUpdatedEvent | ClerkOrgCreatedEvent | { type: string; data: unknown };

function generateSnippetKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "cs_live_";
  for (let i = 0; i < 24; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headersList = headers();
  const svixHeaders = {
    "svix-id": headersList.get("svix-id") ?? "",
    "svix-timestamp": headersList.get("svix-timestamp") ?? "",
    "svix-signature": headersList.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, svixHeaders) as ClerkEvent;
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const { id: clerkUserId, first_name, last_name, email_addresses, primary_email_address_id } = (event as ClerkUserCreatedEvent).data;

    // Try primary first, fall back to first available email
    const primaryEmail =
      email_addresses.find((e: { id: string; email_address: string }) => e.id === primary_email_address_id) ??
      email_addresses[0];
    const email = primaryEmail?.email_address ?? null;

    const name =
      [first_name, last_name].filter(Boolean).join(" ") ||
      email?.split("@")[0] ||
      "My Workspace";

    console.log("[clerk-webhook] user.created", { clerkUserId, email, name });

    const existing = await prisma.tenant.findUnique({ where: { clerkUserId } });
    if (!existing) {
      await prisma.tenant.create({
        data: {
          name,
          clerkUserId,
          ownerEmail: email,
          snippetKey: generateSnippetKey(),
          embedAppId: generateEmbedAppId(),
          embedHmacSecret: generateEmbedHmacSecret(),
        },
      });
    } else {
      // Always backfill email if missing
      if (!existing.ownerEmail && email) {
        await prisma.tenant.update({ where: { clerkUserId }, data: { ownerEmail: email } });
      }
    }
  }

  if (event.type === "user.updated") {
    const { id: clerkUserId, email_addresses, primary_email_address_id } = (event as ClerkUserUpdatedEvent).data;
    const primaryEmail =
      email_addresses.find((e) => e.id === primary_email_address_id) ?? email_addresses[0];
    const email = primaryEmail?.email_address ?? null;
    if (email) {
      await prisma.tenant.updateMany({ where: { clerkUserId }, data: { ownerEmail: email } });
      console.log("[clerk-webhook] user.updated email synced", { clerkUserId, email });
    }
  }

  if (event.type === "organization.created") {
    const { id: clerkOrgId, name, created_by: clerkUserId } = (event as ClerkOrgCreatedEvent).data;

    const existing = await prisma.tenant.findUnique({ where: { clerkOrgId } });
    if (!existing) {
      // If the creator already has a personal tenant, upgrade it to an org tenant
      const personal = await prisma.tenant.findUnique({ where: { clerkUserId } });
      if (personal) {
        await prisma.tenant.update({
          where: { id: personal.id },
          data: { clerkOrgId, name },
        });
      } else {
        await prisma.tenant.create({
          data: {
            name,
            clerkOrgId,
            snippetKey: generateSnippetKey(),
            embedAppId: generateEmbedAppId(),
            embedHmacSecret: generateEmbedHmacSecret(),
          },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
