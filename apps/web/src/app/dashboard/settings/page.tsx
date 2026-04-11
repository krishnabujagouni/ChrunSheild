import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { generateEmbedAppId, generateEmbedHmacSecret } from "@/lib/tenant-embed";
import { SaveButton } from "./save-button";
import { PlansEditor } from "./plans-editor";

type PlanTier = { name: string; priceMonthly: number; stripePriceId?: string };

const DISCOUNT_TIER_VALUES = [10, 25, 40] as const;
type DiscountTier = (typeof DISCOUNT_TIER_VALUES)[number];

type OfferSettings = {
  /** Enabled percent-off tiers (sorted). Empty = no discount offers. */
  allowedDiscountPcts: DiscountTier[];
  discountDurationMonths: 1 | 2 | 3 | 6 | 12;
  allowPause: boolean;
  allowFreeExtension: boolean;
  allowPlanDowngrade: boolean;
  customMessage: string;
  plans: PlanTier[];
};

const DISCOUNT_DURATION_OPTIONS = [1, 2, 3, 6, 12] as const;

/** Legacy `maxDiscountPct` → enabled tiers up to that cap. Invalid / missing → null (caller uses defaults). */
function tiersFromLegacyMax(max: unknown): DiscountTier[] | null {
  const n = Number(max);
  if (!([0, 10, 25, 40] as const).includes(n as 0 | 10 | 25 | 40)) return null;
  if (n === 0) return [];
  return DISCOUNT_TIER_VALUES.filter((t) => t <= n);
}

function parseAllowedDiscountArray(raw: unknown): DiscountTier[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<DiscountTier>();
  for (const x of raw) {
    const n = Number(x);
    if ((DISCOUNT_TIER_VALUES as readonly number[]).includes(n)) set.add(n as DiscountTier);
  }
  return [...set].sort((a, b) => a - b);
}

function parsePlans(raw: unknown): PlanTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" && typeof (p as { priceMonthly?: unknown }).priceMonthly === "number")
    .map((p) => {
      const o = p as { name: string; priceMonthly: number; stripePriceId?: unknown };
      let stripePriceId: string | undefined;
      if (typeof o.stripePriceId === "string") {
        const s = o.stripePriceId.trim();
        if (/^price_[a-zA-Z0-9]+$/.test(s)) stripePriceId = s.slice(0, 64);
      }
      const row: PlanTier = {
        name: String(o.name).trim().slice(0, 50),
        priceMonthly: Math.max(0, Number(o.priceMonthly)),
      };
      if (stripePriceId) row.stripePriceId = stripePriceId;
      return row;
    })
    .filter((p) => p.name && p.priceMonthly > 0)
    .slice(0, 20);
}

function parseOfferSettings(raw: unknown): OfferSettings {
  const defaults: OfferSettings = {
    allowedDiscountPcts: [10, 25],
    discountDurationMonths: 3,
    allowPause: true,
    allowFreeExtension: true,
    allowPlanDowngrade: false,
    customMessage: "",
    plans: [],
  };
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  let allowedDiscountPcts: DiscountTier[];
  if (Array.isArray(r.allowedDiscountPcts)) {
    allowedDiscountPcts = parseAllowedDiscountArray(r.allowedDiscountPcts);
  } else {
    const legacy = tiersFromLegacyMax(r.maxDiscountPct);
    allowedDiscountPcts = legacy ?? defaults.allowedDiscountPcts;
  }
  return {
    allowedDiscountPcts,
    discountDurationMonths: (DISCOUNT_DURATION_OPTIONS as readonly number[]).includes(Number(r.discountDurationMonths))
      ? (Number(r.discountDurationMonths) as 1|2|3|6|12)
      : defaults.discountDurationMonths,
    allowPause:         typeof r.allowPause === "boolean"         ? r.allowPause         : defaults.allowPause,
    allowFreeExtension: typeof r.allowFreeExtension === "boolean" ? r.allowFreeExtension : defaults.allowFreeExtension,
    allowPlanDowngrade: typeof r.allowPlanDowngrade === "boolean" ? r.allowPlanDowngrade : defaults.allowPlanDowngrade,
    customMessage:      typeof r.customMessage === "string"       ? r.customMessage.slice(0, 300) : defaults.customMessage,
    plans: parsePlans(r.plans),
  };
}


async function updateOfferSettings(formData: FormData) {
  "use server";
  const { userId, orgId } = auth();
  if (!userId) return;
  const rawDuration = Number(formData.get("discountDurationMonths"));
  const rawPlans = formData.get("plans") as string | null;
  let plans: PlanTier[] = [];
  try {
    plans = parsePlans(JSON.parse(rawPlans ?? "[]"));
  } catch { plans = []; }

  const pctSet = new Set<DiscountTier>();
  for (const v of formData.getAll("allowedDiscountPcts")) {
    const n = Number(v);
    if ((DISCOUNT_TIER_VALUES as readonly number[]).includes(n)) pctSet.add(n as DiscountTier);
  }
  const allowedDiscountPcts = [...pctSet].sort((a, b) => a - b);

  const settings: OfferSettings & { maxDiscountPct: 0 | 10 | 25 | 40 } = {
    allowedDiscountPcts,
    /** Kept for legacy readers / docs; highest enabled tier, or 0 if none. */
    maxDiscountPct: allowedDiscountPcts.length === 0 ? 0 : (Math.max(...allowedDiscountPcts) as 0 | 10 | 25 | 40),
    discountDurationMonths: (DISCOUNT_DURATION_OPTIONS as readonly number[]).includes(rawDuration)
      ? (rawDuration as 1|2|3|6|12) : 3,
    allowPause:         formData.get("allowPause") === "true",
    allowFreeExtension: formData.get("allowFreeExtension") === "true",
    allowPlanDowngrade: formData.get("allowPlanDowngrade") === "true",
    customMessage:      ((formData.get("customMessage") as string) ?? "").trim().slice(0, 300),
    plans,
  };
  const where = orgId ? { clerkOrgId: orgId } : { clerkUserId: userId };
  await prisma.tenant.update({ where, data: { offerSettings: settings } });
  revalidatePath("/dashboard/settings");
}


export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { stripe_connected?: string; stripe_error?: string; stripe_error_description?: string; error?: string };
}) {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  let tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) redirect("/dashboard");

  const embedAppIdOk  = Boolean(tenant.embedAppId?.trim());
  const embedSecretOk = Boolean(tenant.embedHmacSecret?.trim());
  if (!embedAppIdOk || !embedSecretOk) {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        embedAppId:      embedAppIdOk  ? tenant.embedAppId!      : generateEmbedAppId(),
        embedHmacSecret: embedSecretOk ? tenant.embedHmacSecret! : generateEmbedHmacSecret(),
      },
    });
  }

  const offerSettings  = parseOfferSettings(tenant.offerSettings);
  const stripeConnected = searchParams.stripe_connected === "1";
  const stripeError     = searchParams.stripe_error ?? searchParams.error ?? null;
  const stripeErrorDesc = searchParams.stripe_error_description ?? null;

  return (
    <div style={{ width: "100%" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Settings</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>Manage your workspace and AI behaviour</p>
      </div>

      {/* Banners  full width */}
      {stripeConnected && (
        <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#166534", fontWeight: 500 }}>
          Stripe account connected successfully. ChurnQ can now charge save fees automatically.
        </div>
      )}
      {stripeError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#991b1b" }}>
          Stripe Connect error: {stripeError}{stripeErrorDesc ? `  ${stripeErrorDesc}` : ""}
        </div>
      )}
      {!tenant.embedSecretActivated && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "11px 16px", marginBottom: 20, fontSize: 13, color: "#92400e", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>⚠</span>
          <div>
            <strong>Your embed is unsecured.</strong>{" "}
            Go to <a href="/dashboard/integration" style={{ color: "#92400e", fontWeight: 600 }}>Integration</a> → Step 3 and click <strong>Rotate embed secret</strong> to lock it down.
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

        {/* LEFT  Retention Offer Settings */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "28px 32px" }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Retention Offer Settings</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Control exactly what ChurnQ&apos;s AI is allowed to offer your subscribers during the cancel flow.
            </p>
          </div>

          <form action={updateOfferSettings}>

            {/* Discount tiers (multi-select); agent escalates low → high */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Discount tiers Aria may offer</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                Select every percentage she is allowed to mention. She starts with the <strong>lowest</strong> selected tier and moves to the next only if the subscriber still wants to cancel. Uncheck all to disable price offers.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DISCOUNT_TIER_VALUES.map((pct) => {
                  const checked = offerSettings.allowedDiscountPcts.includes(pct);
                  return (
                    <label key={pct} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${checked ? "#7C3AED" : "#e2e8f0"}`,
                      background: checked ? "#f5f3ff" : "#fff",
                      fontSize: 13, fontWeight: 500,
                      color: checked ? "#7C3AED" : "#374151",
                    }}>
                      <input
                        type="checkbox"
                        name="allowedDiscountPcts"
                        value={pct}
                        defaultChecked={checked}
                        style={{ accentColor: "#7C3AED" }}
                      />
                      {pct}% off
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Discount duration */}
            {offerSettings.allowedDiscountPcts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Discount duration</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                  How many months the discount applies before billing returns to full price. Aria will quote this exact number.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DISCOUNT_DURATION_OPTIONS.map(mo => (
                    <label key={mo} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${offerSettings.discountDurationMonths === mo ? "#7C3AED" : "#e2e8f0"}`,
                      background: offerSettings.discountDurationMonths === mo ? "#f5f3ff" : "#fff",
                      fontSize: 13, fontWeight: 500,
                      color: offerSettings.discountDurationMonths === mo ? "#7C3AED" : "#374151",
                    }}>
                      <input type="radio" name="discountDurationMonths" value={mo}
                        defaultChecked={offerSettings.discountDurationMonths === mo}
                        style={{ accentColor: "#7C3AED" }} />
                      {mo} mo
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid #f1f5f9", marginBottom: 24 }} />

            {/* Toggles */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 14 }}>Retention options</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {([
                { key: "allowPause",         label: "Allow subscription pause",  desc: "Offer a 1-month pause instead of cancelling" },
                { key: "allowFreeExtension", label: "Allow free extension",       desc: "Offer 1–2 weeks free before cancelling" },
              ] as const).map(({ key, label, desc }, i, arr) => (
                <label key={key} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "14px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
                  cursor: "pointer",
                }}>
                  <input
                    type="checkbox" name={key} value="true"
                    defaultChecked={offerSettings[key]}
                    style={{ marginTop: 2, accentColor: "#7C3AED", width: 16, height: 16, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{desc}</div>
                  </div>
                </label>
              ))}
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                <PlansEditor
                  initialPlans={offerSettings.plans}
                  initialAllowDowngrade={offerSettings.allowPlanDowngrade}
                  stripeConnected={!!tenant.stripeConnectId}
                />
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #f1f5f9", margin: "24px 0" }} />

            {/* Custom message */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                Custom message for Aria <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                Added verbatim to Aria&apos;s instructions. Max 300 characters.
              </div>
              <textarea
                name="customMessage"
                defaultValue={offerSettings.customMessage}
                rows={3}
                maxLength={300}
                placeholder='e.g. "Always mention our upcoming feature X" or "Never offer discounts to trial users"'
                style={{
                  width: "100%", boxSizing: "border-box",
                  border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "10px 12px", fontSize: 13,
                  color: "#0f172a", resize: "vertical",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  outline: "none", lineHeight: 1.5,
                }}
              />
            </div>

            <SaveButton label="Save offer settings" savedLabel="Saved!" />
          </form>
        </div>

        {/* RIGHT  sticky sidebar */}
        <div style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>

{/* Notification email */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Notification Email
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              Digests, alerts, and billing summaries are sent here. Update it in your Clerk profile.
            </p>
            <code style={{ fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", color: "#0f172a", display: "block", wordBreak: "break-all" }}>
              {tenant.ownerEmail ?? ""}
            </code>
          </div>

          {/* Connections shortcut */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Connections
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              Manage Stripe, Slack, and Discord integrations.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#0f172a" }}>Stripe</span>
                {tenant.stripeConnectId
                  ? <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>● Connected</span>
                  : <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>○ Not connected</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#0f172a" }}>Slack</span>
                {tenant.slackWebhookUrl
                  ? <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>● Connected</span>
                  : <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>○ Not connected</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#0f172a" }}>Discord</span>
                {tenant.discordWebhookUrl
                  ? <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>● Connected</span>
                  : <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>○ Not connected</span>}
              </div>
            </div>
            <a href="/dashboard/connections" style={{ display: "inline-block", marginTop: 12, fontSize: 12, color: "#7C3AED", fontWeight: 600, textDecoration: "none" }}>
              Manage connections →
            </a>
          </div>

          {/* Quick links */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Quick links
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href="/dashboard/integration" style={{ fontSize: 13, color: "#7C3AED", textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span>→</span> Integration guide
              </a>
              <a href="/dashboard" style={{ fontSize: 13, color: "#7C3AED", textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span>→</span> Overview dashboard
              </a>
              <a href="/dashboard/subscribers" style={{ fontSize: 13, color: "#7C3AED", textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span>→</span> Subscriber health
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
