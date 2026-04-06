import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoAppId = "cs_app_seed_demo012";
  const t = await prisma.tenant.upsert({
    where: { snippetKey: "cs_test_demo" },
    create: {
      name: "Demo tenant",
      snippetKey: "cs_test_demo",
      embedAppId: demoAppId,
      embedHmacSecret: "01".repeat(32),
    },
    update: { name: "Demo tenant" },
  });
  console.log("Seeded demo tenant (snippet_key=cs_test_demo, id=%s)", t.id);
  console.log(
    "Stripe Connect start (set env first): /api/stripe/connect/start?tenantId=%s&secret=<CHURNSHIELD_ONBOARD_SECRET>",
    t.id,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
