import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productName, productUrl, mrrRange, subscriberCount } = await req.json();

  if (!productName || !productUrl || !mrrRange || !subscriberCount) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  await prisma.tenant.updateMany({
    where: { clerkUserId: userId },
    data: {
      onboarded: true,
      onboardingData: { productName, productUrl, mrrRange, subscriberCount },
    },
  });

  return NextResponse.json({ ok: true });
}
