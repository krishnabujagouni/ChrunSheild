import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const tenant = await prisma.tenant.findFirst({
    where: { clerkUserId: userId },
    select: { onboarded: true },
  });

  // Already onboarded  skip straight to dashboard
  if (tenant?.onboarded) redirect("/dashboard");

  return <>{children}</>;
}
