import { prisma } from "@/lib/db";

/** Resolve tenant by public embed id: `cs_live_...` (snippet key) or `cs_app_...` (app id). */
export async function findTenantByPublicEmbedId(publicId: string | undefined | null) {
  const key = publicId?.trim();
  if (!key) return null;
  return prisma.tenant.findFirst({
    where: { OR: [{ snippetKey: key }, { embedAppId: key }] },
  });
}
