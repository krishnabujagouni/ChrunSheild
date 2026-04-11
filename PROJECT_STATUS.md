# ChurnShield  Project Status
*Last updated: April 8, 2026 (Production deployment  Vercel + Railway)*

---

## For future sessions  what changed recently

**Read this block first** when picking up the repo; it summarizes implementation not obvious from file names alone.

### Monthly billing model + Billing dashboard + docs (April 7–8, 2026)

**Decision:** Tenants are charged **once per month** (one Stripe PaymentIntent per workspace per cron run), bundling all eligible saves  not per-save instant charges  so merchants do not see many micro-charges plus a monthly line.

**The only code path that charges the tenant (Stripe Connect):**
- **`apps/web/src/app/api/cron/billing-sweep/route.ts`**  Vercel cron **`0 6 1 * *`** (1st of every month, **06:00 UTC**). Declared in **`apps/web/vercel.json`**. Call manually: `GET` with header **`Authorization: Bearer <CRON_SECRET>`** (same pattern as webhook-cleanup cron).
- Loads `save_sessions` where `offer_accepted = true`, `fee_billed_at` IS NULL, `fee_charged` > 0, `outcome_confirmed_at` IS NOT NULL (and within the sweep’s period logic). **Groups by `tenant_id`**, sums fees, creates **`paymentIntents.create`** on the tenant’s **`stripe_connect_id`**, then sets **`fee_billed_at`** + **`stripe_charge_id`** (PI id) on every session in that batch. Stripe client uses API version **`2025-02-24.acacia`** (must match installed `stripe` types).

**Confirmation without charging:**
- **`apps/agents/src/churnshield_agents/workers/stripe_worker.py`**  **`handle_invoice_paid`** only stamps **`outcome_confirmed_at`**, **`saved_value`**, **`fee_charged`** from invoice amount for **`DEFERRED_OFFER_TYPES`**: `extension`, `discount`, `downgrade`, **`pause`**. It does **not** create a Connect charge (immediate charge helper removed).
- **`apps/web/src/app/api/public/cancel-outcome/route.ts`**  **`IMMEDIATE_CONFIRM`** is **`empathy` only**. **Pause** is deferred: provisional fee on save, outcome confirmed when **`invoice.paid`** matches (same as other deferred types). Discount/downgrade can store provisional `fee_charged` / `saved_value` while **`outcome_confirmed_at`** stays null until **`invoice.paid`**.

**Python `billing.py` (APScheduler “billing sweep”):**
- Still runs on **pause / empathy** (and legacy untyped) rows: after **30 days** since `outcome_confirmed_at`, checks Stripe whether the subscription is still active.
- If **churned**: clears `saved_value` / `fee_charged`, sets **`fee_billed_at`** to mark the row closed (**no** PaymentIntent  tombstone so nothing bills).
- If **active**: does **not** charge; monthly Vercel cron is responsible for money movement. **`_charge_via_stripe_connect`** in the same file is **dead code** (never called).
- **Removed** broken merchant email branch (referenced undefined `stripe_charge_id`) and **removed** per-row “fee charged” emails from this loop (would re-fire on repeated scheduler passes).

**Dashboard `/dashboard/billing`:**
- **`page.tsx`** + **`billing-table.tsx`** (`BillingDashboard`): pills for **Charged this month** (sum of `fee_charged` with `fee_billed_at` in calendar month), **Queued for next bill**, **Awaiting confirmation** (count).
- **Charge history** table: **`groupBy(stripe_charge_id)`** over billed sessions  **one row per Stripe payment**; fallback rows where `stripe_charge_id` is null but fee was billed → **one row per session**, label **“No ref (legacy)”**.
- **Upcoming fees** table: unbilled accepted saves; **Queued** = `outcome_confirmed_at` set; **Confirming** = not set; rows with provisional fee show **“Until Stripe confirms”** under fee.
- Intro copy describes monthly UTC billing and points to **Recent sessions** for per-save detail.
- Sidebar includes **Billing**; **`clerk-auth-header`** **`UserButton`** avatar **32px**; deprecated Clerk **`afterSignOutUrl`** removed from layout/header.

**Docs:** **`docs/api-reference/cancel-outcome.mdx`** fee section updated for monthly collection + confirmation timing + “cancels before paying” behavior. (Earlier in the same initiative: Mintlify-oriented rewrites under **`docs/`** for embed, HMAC, webhooks, Zapier/Make, etc.)

**Env:** **`CRON_SECRET`** must be set on Vercel for cron routes to authorize.

---

### Production Deployment (April 7, 2026)

#### URLs
- **Web (Vercel)**: `https://chrunsheild.vercel.app`
- **Agents (Railway)**: `https://chrunsheild-production.up.railway.app`
- **Health check**: `https://chrunsheild-production.up.railway.app/health`

#### Vercel (Next.js web app)
- Root directory: `apps/web`
- All env vars set in Vercel dashboard (Production + Preview + Development)
- `DATABASE_URL` uses Supabase **transaction pooler** URL (port 6543, `?pgbouncer=true&connection_limit=1`)  direct port 5432 does not work on Vercel serverless
- `STRIPE_CONNECT_REDIRECT_URI` set to production URL
- `NEXT_PUBLIC_APP_URL` set to production URL
- Auto-deploys on every push to `main`

#### Railway (Python agents)
- Root directory: `apps/agents`
- Dockerfile detected automatically (`railway.toml` sets `builder = "dockerfile"`)
- Start command hardcoded to port 8000 in `railway.toml`  Railway `$PORT` injection was unreliable
- All env vars set: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ENVIRONMENT=production`

#### Stripe Webhook
- Endpoint registered: `https://chrunsheild-production.up.railway.app/webhooks/stripe`
- Events: `invoice.paid` + `invoice.payment_failed`
- Signing secret stored as `STRIPE_WEBHOOK_SECRET` in Railway

#### Sidebar UI fixes (April 7, 2026)
- Sidebar content wrapped in `overflowY: auto` scrollable container so Settings/Help remain reachable when InfoCard is visible
- All scrollbars hidden globally in dashboard via `*::-webkit-scrollbar { display: none }` in `hide-scroll.css`
- Nav density tightened further (items ~32px tall, smaller icons/font) so Settings / Help / collapse do not overlap; **Billing** nav entry added
- InfoCard made compact (smaller padding, shorter text, ✕ dismiss button)
- `flex: 1` removed from main nav div so bottom nav doesn't get pushed out of view

#### Known pending
~~- Slack/Discord OAuth redirect URIs still point to ngrok (local dev)  update to production URLs in Vercel env vars + Slack/Discord developer portals when ready~~ ✅ Fixed in Vercel production
~~- `STRIPE_CLIENT_ID` needs full `ca_...` value confirmed in Vercel~~ ✅ Fixed in Vercel production
~~- `ANTHROPIC_MODEL` was accidentally added as `ANTHROPIC_MODE` in Vercel  fix spelling~~ ✅ Fixed in Vercel production

---

### Stripe Connect + retention offer fixes (April 6, 2026)

#### Stripe Connect setup
- **`stripeConnectId` is set via OAuth flow**  Dashboard → Connections → "Connect Stripe" → `/api/stripe/connect/start` → Stripe OAuth → `/api/stripe/connect/callback` saves `token.stripe_user_id` as `tenant.stripeConnectId`. Manually-seeded tenants (direct DB insert) will have `stripeConnectId = ""` and must go through this flow or update the field directly.
- **`STRIPE_CLIENT_ID`** must be set to the `ca_...` value from Stripe Dashboard → Connect → Settings (test mode client ID). Without it the Connect flow returns `"No application matches the supplied client identifier"`.
- **`STRIPE_CONNECT_REDIRECT_URI`** must be added to the allowed redirect list in the same Stripe Connect Settings page.
- **`applyStripeOffer` account routing**: when `stripeConnectId` is empty the platform `STRIPE_SECRET_KEY` is used directly (no `stripeAccount` header). If the subscription lives on a different Stripe account than the key's owner, Stripe returns `resource_missing`. Fix: either go through the Connect OAuth flow or manually set `stripeConnectId` to the correct `acct_...` value. The account ID is embedded in resource IDs  e.g. `sub_1TJLOS1o8oT6sd4n` → account `acct_1TG6OH1o8oT6sd4n`.

#### Downgrade  apply at next billing cycle
- **`proration_behavior` changed from `"create_prorations"` to `"none"`** in `cancel-outcome/route.ts` downgrade path. Previously the price swap triggered immediate proration credits/charges on the current invoice. Now the switch takes effect cleanly at the next renewal  no proration line items.

#### Downgrade  remove prior ChurnShield coupon
- **Belt-and-suspenders coupon cleanup** added to the downgrade path in `cancel-outcome/route.ts`:
  1. `stripe.subscriptions.deleteDiscount(subscription.id)`  removes legacy singular `subscription.discount` field.
  2. `stripe.customers.retrieve(customerId, { expand: ["discount.coupon"] })` + `stripe.customers.deleteDiscount(customerId)`  removes any ChurnShield coupon at the customer level (identified by `isChurnShieldRetentionCoupon`).
- Both calls are best-effort (wrapped in `try/catch`) and never block the save record.
- **Why**: customer-level Stripe coupons don't appear in `subscription.discounts`, so `nonChurnShieldDiscountUpdateParams` alone didn't catch them. Without this fix a prior 25% off coupon persisted through the plan downgrade, stacking both benefits.

#### Double-dipping prevention  offer lock
- **`offersLocked` flag** added to `CancelAgentContext` and `buildCancelAgentSystem` in `cancel-agent.ts`. When `true`, the system prompt replaces the merchant allowlist with a hard block: "No promotional incentives available  this subscriber already has an active retention offer. Empathy and product support only."
- **Check in `cancel-chat/route.ts`**: before building the system prompt, queries `SaveSession` for any row where `subscriberId` matches + `offerAccepted = true` + `feeBilledAt = null` (prior session, not current). If found → `offersLocked: true`.
- **Effect**: a customer who already accepted a discount or downgrade (and the fee hasn't been billed yet) cannot stack a second financial offer in a new cancel flow. Lock lifts automatically once **`feeBilledAt`** is set by the **monthly Vercel `billing-sweep`** (tenant charged) or the prior row is voided.

#### Keep my subscription  shows actual price
- **`buildOfferLabel(offer)`** in `cs.js` updated:
  - `discount`: now computes discounted price from `identifyState.subscriptionMrr`  label becomes e.g. `"Claim 25% off for 3 mo → $74.25/mo  stay subscribed"`.
  - `downgrade`: uses `offer.targetPriceMonthly` + `offer.targetPlanName`  label becomes e.g. `"Activate $49/mo · medium  stay subscribed"`. Previously both showed generic text with no price.

#### Offer endpoint key mismatch fix
- **`GET /api/public/cancel-chat/offer`** now checks both `tenant.snippetKey` and `tenant.embedAppId` against the `key` query param. Previously only checked `snippetKey`, so when `cs.js` used `data-app-id` (`cs_app_...`) as the key the check always failed and returned `{ offer: null }`  causing the Keep button to never update its label.

#### Stripe error logging improvement
- **`applyStripeOffer`** in `cancel-outcome/route.ts`: `resource_missing` Stripe errors (stale/wrong-account subscription IDs) now log as `console.warn` instead of `console.error`, reducing noise during testing. All other Stripe errors still use `console.error`.

---

### Zapier + Make connections (April 6, 2026)
- **`apps/web/src/app/dashboard/connections/zapier-make-card.tsx`**  Two platform cards (Zapier + Make) rendered inside the connections page integration list card, same row layout as Stripe/Slack/Discord.
- **Flow**: User clicks "Connect" → panel expands inline → user opens Zapier/Make in new tab → creates a Catch Hook / Custom Webhook → copies the URL → pastes it back → clicks Save. ChurnShield creates a labeled webhook endpoint (`label: "zapier"` or `"make"`) and stores it in `webhook_endpoints`.
- **Connected state**: shows URL (truncated monospace), Copy URL button, "Send test event" button (turns green on success), "Disconnect" button  all in a bordered card matching the webhook endpoint list style.
- **Labels**: `WebhookEndpoint.label` field (`String? @db.VarChar(32)`) distinguishes Zapier/Make endpoints from custom ones. `label` added to Prisma schema + `npx prisma db push` run. API routes (`GET /api/webhooks`, `POST /api/webhooks`) return/accept `label` field.
- **One connection per platform**: `page.tsx` uses `find(e => e.label === "zapier")`  one labeled endpoint per platform. Users needing multiple endpoints use the Custom Webhooks section.
- **Zapier deep link**: `https://zapier.com/app/editor`. **Make deep link**: `https://www.make.com/en/login`.
- **Tested and working** ✅  Zapier connected, test event received. Make connected, test payload confirmed in scenario run (`event: webhook.test`, `data.test: true`, `data.source: churnshield_dashboard`).

### Webhook hardening + minor fixes (April 6, 2026)
- **Python timestamp normalized**  `churn_prediction.py` now produces `2025-04-05T12:00:00.123Z` (milliseconds + `Z`) matching TypeScript's `new Date().toISOString()` exactly. Previously used Python's `.isoformat()` which produces `+00:00` suffix.
- **Rate limit on webhook test endpoint**  `webhookTest` limiter added to `apps/web/src/lib/rate-limit.ts` (5 requests per minute per `tenantId:endpointId`). Wired into `POST /api/webhooks/[id]/test`. Fails open if Upstash Redis not configured.
- **Delivery log cleanup cron**  `GET /api/cron/webhook-cleanup` deletes `webhook_deliveries` rows older than 15 days. Runs daily at 3am UTC via Vercel cron (`vercel.json`). Secured with `CRON_SECRET` header (`Authorization: Bearer <secret>`). Set `CRON_SECRET` in Vercel environment variables  Vercel injects it automatically for cron routes.
- **Slack/Discord OAuth callback hardened**  `tokenRes.json()` wrapped in try/catch in both `slack/callback/route.ts` and `discord/callback/route.ts`. If Slack/Discord is unreachable or returns non-JSON, redirects back to settings with `token_exchange_failed` error param instead of crashing 500.
- **Slack/Discord disconnect hardened**  Prisma `update` wrapped in try/catch in both disconnect routes. Returns clean 404 if tenant row doesn't exist (P2025) instead of unhandled crash.
- **Webhook toggle rollback**  `handleToggle` in `webhooks-section.tsx` now rolls back optimistic UI state if the PATCH request fails. Before: failed API call left toggle in wrong visual state permanently.
- **Slack/Discord channel name removed from button area**  channel name (`#new-channel`) was showing next to the Disconnect button. Removed from both `slack-connect-card.tsx` and `discord-connect-card.tsx`. Channel already shown in `● Connected · #channel` badge on the left side of the row.
- **All connect buttons unified**  Stripe "Connect", Slack "Authorize", Discord "Authorize", Zapier "Connect", Make "Connect", Webhooks "Connect" all use same black `#18181b` style.

### Webhooks (April 5, 2026)
- **`WebhookEndpoint` model** added to Prisma schema (`webhook_endpoints` table). Fields: `id`, `tenantId`, `url` (varchar 2048), `events` (String[]  subset of `["save.created","high_risk.detected"]`), `secret` (varchar 128, `whsec_...` prefix), `enabled` (bool), `createdAt`. Run `npx prisma db push` to sync (already done).
- **`apps/web/src/lib/webhooks.ts`**  `fireWebhooks(tenantId, event, data)`: queries enabled endpoints for the event, signs payload with HMAC-SHA256, POSTs with `X-ChurnShield-Signature: sha256=<hex>` + `X-ChurnShield-Event` headers, retries 3× (1.5s, 3s backoff). Fully non-blocking (never throws). `generateWebhookSecret()` produces `whsec_<32 random bytes hex>`.
- **Payload format**: `{ event, timestamp: ISO8601, data: { ...fields } }`. Same envelope for all events.
- **Events fired**:
  - `save.created`  in `cancel-outcome/route.ts` after every accepted offer (non-blocking, after Slack/Discord alerts). Payload: `tenant_id`, `subscriber_id`, `subscriber_email`, `offer_type`, `discount_pct`, `mrr_saved`.
  - `high_risk.detected`  in `churn_prediction.py` per high-risk subscriber after Slack/Discord. Python queries `webhook_endpoints` directly (same DB), signs with stdlib `hmac` + `hashlib`, fires via `urllib.request`. Payload: `tenant_id`, `subscriber_id`, `risk_score`, `risk_class`, `cancel_attempts`, `failed_payments`, `days_since_activity`.
- **API routes**:
  - `GET /api/webhooks`  list tenant's endpoints (auth: Clerk).
  - `POST /api/webhooks`  create endpoint (validates URL, events, max 10 per tenant).
  - `DELETE /api/webhooks/[id]`  delete (ownership checked).
- **UI** (`apps/web/src/app/dashboard/connections/webhooks-section.tsx`):
  - Row inside the Connections page integration list card  same icon/name/desc/button layout as Stripe, Slack, Discord.
  - "Connect" button (black) → expands inline panel with add-endpoint form (URL input + event checkboxes) + list of existing endpoints.
  - "Manage" button shown when endpoints already exist; "Close" collapses.
  - Each endpoint shows: URL, event badge pills, signing secret (masked, reveal/copy buttons), remove button.
  - Collapsible "View example payloads" showing JSON shape for both events  for developers wiring their handler.
- **Testing**: Use [webhook.site](https://webhook.site)  paste the free unique URL as the endpoint URL, trigger a save or run the churn prediction agent to see signed POSTs arrive.
- **Zapier**: Once webhooks are working, tenants can connect to Zapier/Make immediately via "Webhooks by Zapier" (catch hook)  no native Zapier app needed. Native app is a later polish step.

### Connections page refactor (April 5, 2026)
- **New page** at `/dashboard/connections` (`apps/web/src/app/dashboard/connections/page.tsx`). Server component  fetches tenant + webhookEndpoints in one query.
- **Layout**: YouForm-style flat list  single card with rows for Stripe, Slack, Discord, Webhooks. Each row: 44px icon circle + name/desc left, button right, dividers between rows.
- **Stripe row**: "Required" badge, "Connect" button → `/api/stripe/connect/start`. Shows "● Connected" badge + "Reconnect →" link when connected.
- **Slack row**: "Authorize" button (black, replaces old Slack purple). Uses `SlackConnectCard` for connected state.
- **Discord row**: "Authorize" button (black, replaces old Discord blurple). Uses `DiscordConnectCard` for connected state.
- **Webhooks row**: "Connect" / "Manage" button toggles inline form. Handled entirely by `WebhooksSection` client component.
- **"Not seeing an integration you need?" banner** at top  mailto link for integration requests.
- **Notification summary** at bottom: 3 cards with HugeIcons (`CheckmarkCircle01Icon` green, `AlertDiamondIcon` amber, `NotificationOff01Icon` gray) explaining what events fire to Slack/Discord.
- **Sidebar nav**: "Connections" link (`Plug01Icon`) added to main nav.
- **Settings page**: Stripe/Slack/Discord cards removed from sidebar; replaced with compact "Connections" status card showing ● Connected / ○ Not connected per integration + "Manage connections →" link.
- **Connect buttons unified**: All three integrations (Stripe, Slack, Discord) now use the same black `#18181b` "Connect" / "Authorize" button style  no more colored brand buttons.

### Discord OAuth integration (April 5, 2026)
- **`discordWebhookUrl String?`** and **`discordChannelName String?`** on `Tenant` model (`discord_webhook_url`, `discord_channel_name` columns). Run `npx prisma db push` to sync.
- **`apps/web/src/lib/discord.ts`**  two exported helpers using Discord embeds:
  - `sendDiscordSaveAlert`  fires when a subscriber clicks "Keep my subscription". Embed color: green `0x22c55e`. Includes customer, offer type, MRR saved, timestamp.
  - `sendDiscordHighRiskAlert`  fires per high-risk subscriber from churn prediction. Embed color: amber `0xF59E0B`. Includes customer, risk score %, cancel attempts, failed payments, days inactive.
- **OAuth flow** (`webhook.incoming` scope  no bot token needed):
  - `GET /api/discord/connect`  redirects merchant to Discord OAuth. Uses `signConnectState` (same HMAC state as Stripe/Slack).
  - `GET /api/discord/callback`  exchanges code via `https://discord.com/api/oauth2/token`, saves `webhook.url` + `webhook.name` (channel name) to tenant.
  - `POST /api/discord/disconnect`  clears `discordWebhookUrl` + `discordChannelName`.
- **Settings UI** (`discord-connect-card.tsx`)  "Connect Discord" button (Discord blurple `#5865F2`, Discord logo SVG). After OAuth: shows green "Connected" pill + `#channel-name` + "Disconnect Discord" button.
- **`cancel-outcome` route**  fires both Slack and Discord save alerts in parallel (non-blocking) when respective webhook URLs are set.
- **`churn_prediction.py`**  `_get_tenant_notification_urls` now fetches `slack_webhook_url`, `discord_webhook_url`, and `name` in one query. Fires `_send_slack_high_risk` and `_send_discord_high_risk` per high-risk subscriber. Both use shared `_post_webhook` helper (stdlib `urllib.request`, no new deps).
- **Env vars required**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` (must be HTTPS  use ngrok in dev). Add redirect URI in Discord Developer Portal → OAuth2 → Redirects.
- **Tenant onboarding note**: Tenants must **create a Discord channel first** (recommended: `churnshield-alerts`) in their server before clicking "Connect Discord". During the OAuth screen Discord asks which server + channel to post to  they select that channel. ChurnShield cannot create channels automatically (requires `MANAGE_CHANNELS` bot permission  not implemented, not worth it at MVP).
- **Alerts sent to Discord**: save confirmed + high-risk subscriber only. Feedback digests go to email only (Resend).
- **Tested and working** ✅  embed alerts confirmed firing in Discord channel.

### Slack OAuth integration (April 5, 2026)
- **`slackWebhookUrl String?`** and **`slackChannelName String?`** on `Tenant` model (`slack_webhook_url`, `slack_channel_name` columns). Run `npx prisma db push` to sync.
- **`apps/web/src/lib/slack.ts`**  two exported helpers using Block Kit:
  - `sendSlackSaveAlert`  fires when a subscriber clicks "Keep my subscription" (save confirmed). Includes customer, offer type, MRR saved.
  - `sendSlackHighRiskAlert`  fires per high-risk subscriber from the churn prediction job. Includes customer, risk score %, cancel attempts, failed payments, days inactive.
- **`cancel-outcome` route**  calls `sendSlackSaveAlert` non-blocking after a successful save if `tenant.slackWebhookUrl` is set.
- **`churn_prediction.py`**  fetches `slack_webhook_url` from DB once per run, calls `_send_slack_high_risk` per high-risk subscriber via `asyncio.to_thread`.
- **OAuth flow** (replaces old manual webhook paste):
  - `GET /api/slack/connect`  redirects merchant to Slack OAuth (scope: `incoming-webhook`). Uses `signConnectState` (same HMAC state as Stripe Connect).
  - `GET /api/slack/callback`  exchanges code via `https://slack.com/api/oauth.v2.access`, saves `incoming_webhook.url` + `incoming_webhook.channel` to tenant.
  - `POST /api/slack/disconnect`  clears `slackWebhookUrl` + `slackChannelName`.
- **Settings UI** (`slack-connect-card.tsx`)  "Add to Slack" button (Slack purple, Slack logo icon). After OAuth: shows green "Connected" pill + channel name (e.g. `#churnshield-alerts`) + "Disconnect Slack" button.
- **Env vars required**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` (must be HTTPS  use ngrok in dev).
- **Tenant onboarding note**: Tenants must **create a Slack channel first** (recommended: `#churnshield-alerts`) before clicking "Add to Slack", then select that channel in the Slack permission screen. ChurnShield cannot create channels automatically (would require `channels:manage` bot scope  not implemented, not worth it at MVP).
- **Alerts sent to Slack**: save confirmed + high-risk subscriber only. Feedback digests go to email only (Resend).
- **Hydration fix**  `subscribers-table.tsx` `lastScored` column was using `new Date(v).toLocaleDateString()` which produces different output on Node.js (server) vs browser (client locale). Fixed to `v.slice(0, 10)` → stable `YYYY-MM-DD`.

### Landing page refactor (April 5, 2026)
- **All Lucide icons removed** from `apps/web/src/app/page.tsx`. Every icon now uses `@hugeicons/react` (`HugeiconsIcon` component + icon data objects from `@hugeicons/core-free-icons`). Pattern: `<HugeiconsIcon icon={IconDataObject} size={n} />`. **Important:** many icon names differ from Lucide equivalents  always verify against the installed package with `node --input-type=module` before using a new icon name.
- **Spinning triangle nav logo** added to landing page nav (left of "ChurnShield" wordmark). Uses inline SVG `<polygon>` with `strokeDasharray` + CSS `@keyframes cs-nav-logo-tri` animation. Class `cs-nav-logo-tri` (distinct from dashboard sidebar's `cs-logo-tri`).
- **"How it works" section** replaced with `HowItWorks` component (`apps/web/src/components/blocks/how-it-works.tsx`). Blog7-style 3-column card grid (shadcn `Card` + `Badge`). Uses HugeIcons: `SourceCodeIcon`, `BubbleChatSparkIcon`, `Analytics01Icon`, `CheckmarkCircle01Icon`. White background, `lnd-shell` container. The old `ContainerScroll` / `CardSticky` sticky-scroll section is gone.
- **`ProductPillarSection` function removed** entirely from `page.tsx` (was dead code after the sticky-scroll removal).
- **Logo strips removed**  both the top strip (after metrics) and bottom strip (before footer CTA) are gone.
- **Footer CTA dark section removed**  was a standalone dark "start saving" block before the footer; no longer needed.
- **Footer replaced** with `ModemAnimatedFooter` (`apps/web/src/components/ui/modem-animated-footer.tsx`). Large ghost "CHURNSHIELD" background text, spinning triangle brand icon (white on black box, class `cs-footer-logo-tri`), white background. Social links: **mail only** (`Mail01Icon` → `mailto:hello@churnshield.ai`). Twitter/GitHub removed.
- **ChatCard** (hero section mock): user bubble `#3f3f46` bg, AI bubble white with `#e4e4e7` border, "Keep my subscription" button `#d1fae5` bg / `#059669` text / `#a7f3d0` border.
- **Nav mobile toggle** icons: open = `Menu01Icon`, close = `Cancel01Icon`.
- **Feature108 tab icons**: `BubbleChatIcon`, `CreditCardIcon`, `ChartLineData01Icon`, `Robot01Icon`. Bento grid: same + `BarChartIcon`, `Settings02Icon`.

### Dashboard settings refactor (April 5, 2026)
- **`SaveButton` component** added at `apps/web/src/app/dashboard/settings/save-button.tsx`. Client component (`"use client"`). No icons. Tooltip shows "Save changes" on hover; shows "Changes saved!" for 2s after click (button turns emerald green + text "Saved"). Props: `label`, `savedLabel`, `size` (`"sm"` | `"default"`).
- **Workspace card removed** from settings sidebar. Each ChurnShield tenant = one SaaS product; the editable workspace name served only as a dashboard header label and was unnecessary. `updateWorkspaceName` server action removed.
- **Dashboard `<h1>` changed** from `{tenant.name}` → `"Overview"` (static) in `apps/web/src/app/dashboard/page.tsx`.
- **Layout fix** for SaveButton in settings: added `minWidth: 0` to the `<input>` (flex items need this to shrink) and `flexShrink: 0` wrapper around the button so it doesn't overflow the card.
- **Integration page copy button** (`apps/web/src/app/dashboard/integration/copy-button.tsx`) rewritten to use `TooltipProvider` + `Tooltip` + `TooltipTrigger` + `TooltipContent` (shadcn) + HugeIcons (`Copy01Icon`, `CheckmarkCircle01Icon`). Two variants: `"overlay"` (absolute-positioned over dark code block) and `"inline"` (sits next to code value). Animated icon transition on copy success.

### Cancel chat widget (`cs.js`)  April 5, 2026
- **Header redesign**: white background (`#ffffff`), dark text, removed avatar element, title changed to `"Aria · Retention Assistant"`, subtitle `"ChurnShield · Active"`. Close button: gray bg `#f4f4f5`, gray `×`. Bottom border `1px solid #f0f0f0`.
- **AI avatar**: light gray circle `#f4f4f5` with border + sparkle/star SVG icon (inline SVG, no external deps). No ChurnShield logo in chat.
- **User bubbles**: solid black (`#09090b`), no gradient. AI bubbles: white with light border.
- **Dynamic offer button**: After each AI message stream completes, `cs.js` calls `GET /api/public/cancel-chat/offer?sessionId=&key=` (new endpoint, see below). If an offer is present, `buildOfferLabel(offer)` generates a human-readable label (e.g. "Claim 10% off · Stay subscribed") and updates the `.cs-keep` button innerHTML so the user sees the actual offer, not just "Keep my subscription".
- **`buildOfferLabel(offer)`** function in `cs.js`: switches on `offer.type`  `discount` → "Claim {pct}% off · Stay subscribed", `pause` → "Pause my subscription", `extension` → "Claim {months}-month free extension", `downgrade` → "Switch to a lower plan", default → "Keep my subscription".
- **Clean chat input**: Changed from `<textarea>` to `<input type="text">` with `-webkit-appearance:none; appearance:none; box-shadow:none` to suppress browser default border/box-shadow. `.cs-input:focus` CSS: `border:none; box-shadow:none`. No attachment button.
- **Send button**: 30×30px, `border-radius:8px` (rounded square, not circle), arrow-up SVG icon.
- **"Before you go" heading removed**  replaced with the agent name in the header.

### New API endpoint: pending offer (April 5, 2026)
- **`GET /api/public/cancel-chat/offer`** (`apps/web/src/app/api/public/cancel-chat/offer/route.ts`). Params: `sessionId`, `key` (snippetKey). Validates that the session belongs to the tenant with that `snippetKey`. Returns `{ offer: PendingOffer | null }`. CORS `*`. Used by `cs.js` after each AI turn to show the structured offer on the "Keep my subscription" button.

### Bug fixes (April 5, 2026)
- **React hydration error** in `DashboardSidebar` (`InfoCard`): `useState` initializer was reading `localStorage` on client first render while server returned `false`, causing HTML mismatch. Fixed in `apps/web/src/components/ui/info-card.tsx`: initialize to `false`, read `localStorage` in `useEffect` after mount.
- **Prisma `P2022` error** (`column save_sessions.pending_offer does not exist`): Migration `20260404120000_pending_offer` existed but wasn't applied to the DB. Fixed with `npx prisma migrate deploy`.

---

### Dashboard, AI Analyst & semantic retrieval (April 2026)
- **Recent Sessions** (`/dashboard/sessions`)  Server fetches up to **500** `save_sessions` (cancel attempts); client **`sessions-table.tsx`** filters: search (email / subscriber ID), outcome (saved / cancelled / all), offer type, date range (local day bounds). Inline styles only. Summary pills reflect the **filtered** set.
- **AI Analyst** (`POST /api/feedback/search`, `/dashboard/feedback`)  Prompt includes per-session **`offer_made`** and **`saved_value`** (not only user-role transcript lines) so answers like “what discount was offered?” match DB. **`AIChatInput`** wrapped in **`forwardRef`**; feedback page **`inputRef`** restores focus after “New conversation”.
- **Hybrid digest retrieval**  `lib/feedback-digest-retrieval.ts`: **pgvector** cosine nearest neighbors on `feedback_digests.embedding`; query vectors from **`lib/voyage-embed.ts`** (**`voyage-3-lite`**, `input_type: query`)  must match agents’ digest embeddings (**document**). Keyword overlap **fills** remaining slots up to 3 digests. Without **`VOYAGE_API_KEY`** or if SQL/embed fails → keyword-only (graceful).
- **`VOYAGE_API_KEY`**  Documented in **`infra/env.example`**; set on **Vercel** (same key as agents). DB needs `vector` extension + `embedding vector(512)` on `feedback_digests` (see Prisma schema comments).
- **Debug / observability**  Short **`traceId`** (8 hex chars) in JSON response and in every server log line prefixed `[feedback-search <traceId>]` (`route`, `digest-retrieval`, `voyage-embed`). Feedback UI logs `traceId` to the browser console for correlation.

### Embed & public APIs (`cs.js`, test page)
- **Cancel chat UI**  Chat-style overlay (bubbles, typing indicator, markdown for bold in assistant messages), `prefers-reduced-motion` respected.
- **`detectOffer()`**  Scans assistant messages, sends `offerType` + `discountPct` to `cancel-outcome` so billing matches the conversation.
- **Confirm path**  Stripe / fees only run when the subscriber taps **Keep my subscription**; assistant prompt says never claim billing is already updated until then.
- **Re-fire cancel**  “I still want to cancel” and header **×** call `postOutcome("cancelled")` then replay the original cancel click (`_bypassNext`) so the merchant’s native cancel flow still runs.
- **`test-overlay.html`**  `USE_REAL_APIS` toggles real `cancel-intent` / `cancel-chat` / `cancel-outcome` vs mocks. Use **`defer`** (not `async`) for `cs.js` so `data-key` is set before the script runs (otherwise `cancel-intent` never fires and no DB row).

### `cancel-outcome` & Stripe (flexible billing, Connect)
- **Apply offer to Stripe** after DB write: discount → coupon + `subscriptions.update` with **`discounts: [...]`** (not legacy `coupon` param) for **`billing_mode.type=flexible`** on the sub.
- **Shared coupons** per Connect account + shape: id `churnshield_ret_{pct}p_{3}m` (constant `RETENTION_DISCOUNT_DURATION_MONTHS = 3` in route). **`duration: repeating`** only  never forever; after N periods price returns to list.
- **Customer-facing coupon name**  `{tenant.name} · {pct}% off (3 mo)`; metadata `source: churnshield`.
- **No stacking ChurnShield retention discounts**  Before attaching a new retention coupon, drop existing subscription discounts whose coupon is ChurnShield (metadata, id prefix, or legacy name `ChurnShield {n}% retention offer`).
- **Double fee guard**  On **`saved`**, `updateMany` voids other rows for same `tenantId` + `subscriberId` with `feeBilledAt` null and `offerAccepted` true (clears fee fields, sets `offerAccepted` false) so only the **latest** save stays eligible for `stripe_worker` / sweep. **Transcript/offer_made preserved.**

### Agents
- **`stripe_worker.handle_invoice_paid`**  Confirms deferred offers (**extension / discount / downgrade / pause**): sets `outcome_confirmed_at` + fee from **`invoice.paid`** (`DEFERRED_OFFER_TYPES`). **Does not** charge Connect  billing is monthly on Vercel cron. Query requires **`offer_accepted = true`** (voided rows excluded).

### Dashboard & UX
- **Retention offer settings**  `tenants.offer_settings` JSON + Settings UI (max discount %, toggles pause / extension / downgrade, custom Claude note). **Bug fixed:** duplicate `name` on hidden+checkbox caused FormData to always read `false`; only checkbox remains.
- **Clerk hydration**  Root layout auth moved to **`ClerkAuthHeader`** client component (mount gate) so `UserButton` portal doesn’t SSR-mismatch.

### Cancel agent prompt (`cancel-agent.ts`)
- **`buildMerchantAllowlist`**  Explicit list of what the merchant enabled vs disabled (from Settings).
- **One incentive per assistant message**  No bundled “pause then 25%” in one offer; either/or across turns is OK. Aligns with single `offerType` in `cancel-outcome` / `detectOffer`.

### Embed grace mode (April 3, 2026)
- **`Tenant.embedSecretActivated`** (`Boolean @default(false)`)  false until merchant clicks "Rotate embed secret". Migration: `20260403130000_embed_grace_mode`.
- **`cancel-intent` grace mode logic:**
  - Hash provided → always verify (wrong hash = 401 even in grace mode)
  - No hash + `embedSecretActivated = true` → 401 `auth_hash_required`
  - No hash + `embedSecretActivated = false` → allow through with `X-ChurnShield-Warning: embed_unsigned` header + `warning`/`hint` in JSON body
- **`embed-hmac` POST**  sets `embedSecretActivated: true` alongside the new secret on rotate. First rotate = grace mode exits permanently.
- **Settings page**  yellow `⚠ Your embed is unsecured` banner visible until `embedSecretActivated = true`.
- **`EmbedSigningControls`**  "Secured" (green) / "Unsecured" (yellow) pill badge next to "Server signing" heading. Badge flips to Secured in-place after a successful rotate (no page reload needed).

### Embed HMAC signing + App ID (April 3, 2026)
- **Schema**  `Tenant.embedAppId` (`cs_app_...`, unique, 32 chars) + `Tenant.embedHmacSecret` (128 chars). Auto-generated on first settings page load if missing.
- **`cancel-intent` now requires `authHash`**  `verifyEmbedAuthHash(secret, subscriberId, hash)` checks HMAC-SHA256(hex). Missing or invalid hash → 401. Accepts both `snippetKey` and `appId` as public tenant identifier.
- **New identify fields**  `subscriptionId` (→ `stripeSubscriptionId` on session), `subscriberEmail` (shown in dashboard instead of raw `cus_`). `getAuthHash(cus)` async callback fetches hash from merchant's server; `authHashUrl` as alternative.
- **Settings page**  Snippet tag now includes `data-app-id`. `identify()` block shows `getAuthHash` pattern. `EmbedSigningControls` client component shows App ID + Snippet key, "Rotate embed secret" button (POST `/api/dashboard/embed-hmac`), copy-once yellow banner on rotation, expandable Next.js example route.
- **Server signing example**  `CHURNSHIELD_EMBED_SECRET` env var; `HMAC-SHA256(secret, subscriberId)` hex returned from merchant's `/api/churnshield-auth` route. Only called when subscriber actually cancels.
- **Helper libs**  `src/lib/embed-auth.ts` (`verifyEmbedAuthHash`), `src/lib/tenant-embed.ts` (`generateEmbedAppId`, `generateEmbedHmacSecret`), `src/lib/tenant-by-embed.ts` (`findTenantByPublicEmbedId`  looks up by `embedAppId` OR `snippetKey`), `src/lib/subscriber-stripe.ts` (validates `cus_` prefix, normalizes sub/email), `src/lib/save-session-emails.ts` (writes `subscriberEmail` post-create).

### Streaming cancel agent (April 3, 2026)
- **`apps/web/src/lib/cancel-agent.ts`**  Retention-focused system prompt (`CANCEL_AGENT_SYSTEM`), `createAnthropic()` + model id from `ANTHROPIC_MODEL` env (default `claude-3-5-sonnet-20241022`, overrideable).
- **`/api/public/cancel-chat/route.ts`**  `POST` with `{ snippetKey, sessionId, messages }` (last message must be `user`; only string content). Returns plain-text stream via `toTextStreamResponse()` with `CORS *`. **`makeOffer` tool** (`inputSchema` + `execute`), **`stopWhen: stepCountIs(2)`**; `onFinish` writes **`transcript`** and, when the model calls the tool, **`pending_offer`** JSON. `maxDuration = 60` for long Vercel streams.
- **`cs.js` overlay**  After successful `cancel-intent`, opens "Before you go" chat overlay, seeds first user message ("I was about to cancel…"), streams assistant reply into bubbles, supports follow-up Send. Re-opening cancel replaces the overlay cleanly.
- **Stripe Connect OAuth**  `/api/stripe/connect/start` (HMAC-signed state, `CHURNSHIELD_ONBOARD_SECRET`) + `/callback` (validates state, `oauth.token`, saves `stripeConnectId`; handles P2002 duplicate). Dependency: `stripe` on `apps/web`.
- **Payment recovery pipeline**  `insert_stripe_event` returns `UUID | None` (None = duplicate idempotency key). `stripe_worker.py` uses `FOR UPDATE` transaction: locks row with `processed = false`, runs handler, sets `processed = true` (rollback on error). `payment_recovery.py` maps Stripe error codes → `failure_class` on `invoice.payment_failed`. `main.py` adds `logging.basicConfig(INFO)`.
- **Env**  `infra/env.example` has `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (optional override), `STRIPE_CONNECT_REDIRECT_URI`, `CHURNSHIELD_ONBOARD_SECRET`, `NEXT_PUBLIC_APP_URL`.

### Next logical slice (not yet built)
- ~~**Agent tool calls** (`makeOffer`, …) inside cancel-chat~~  **Done (April 2026):** `makeOffer` tool (`inputSchema` + `execute`), `stopWhen: stepCountIs(2)`, `save_sessions.pending_offer` JSON written in `onFinish`; **`cancel-outcome`** resolves offer via **`resolveBillingOfferFromSession`** (validated `pending_offer` first, then client body, else empathy).
- **Link accepted offers** → `offer_made` / `offer_accepted` fields on `save_sessions` from within the chat route (still partially client-driven at outcome; `offer_made` text now prefers tool `summary` when pending wins).

### Structured tools  pitch deck vs shipped (keep docs honest)

Some **one-pagers** describe structured tools like this (ideal):

`makeOffer({ type: "discount", pct: 25, months: 3, price: 74.25 })`  
plus claims that Stripe was **manual** before, that **rejected** offers are **logged**, and that **`offer_type` is always** correct.

**What the repo actually implements**

| Topic | Shipped behavior |
|-------|-------------------|
| **Tool shape** | `makeOffer` uses **`type`**, optional **`discountPct`** / **`discountMonths`**, and **`summary`** (see `cancel-agent.ts`). There is **no `price`** field; Stripe retention discounts are **percent × repeating months**, not arbitrary dollar targets. |
| **Where it is stored** | Last tool result per completed chat turn → **`save_sessions.pending_offer`** (JSON). |
| **On “Keep my subscription”** | **`cancel-outcome`** calls **`resolveBillingOfferFromSession`**: **(1)** validated **`pending_offer`**, else **(2)** client **`offerType` / `discountPct`** (e.g. from **`cs.js` `detectOffer`**), else **(3)** **empathy** for a save. Merchant allowlist + MRR tier caps + discount tier snapping are enforced server-side. |
| **Stripe automation** | **`applyStripeOffer`** in **`cancel-outcome`** (coupon / pause / extension) **already existed** before tools  tools improve **which** offer is applied, not “we added Stripe from scratch.” |
| **Rejected offers** | **Not built**  no separate “offered but rejected” event; **`pending_offer`** reflects the **latest** structured proposal from the model when it uses the tool. |
| **“No regex”** | **Primary** path is structured when the model calls **`makeOffer`**; **`detectOffer`** remains a **fallback** when **`pending_offer`** is missing or invalid  so regex is **not fully removed**. |
| **Always accurate / A/B** | **Not guaranteed**  accuracy improves when the model **consistently** calls **`makeOffer`**; enforcement, dropping the heuristic, and analytics are **follow-ups** (see roadmap row **Structured tools  partially done**). |

### Still not built (known gaps)
- **Hybrid packages** (e.g. pause month + discount after resume)  not one atomic `offerType`; would need `pause_then_discount` + scheduling/webhooks or Stripe Subscription Schedule.
- **Deploy**  Vercel + Railway + production Stripe webhook to agents URL still the main launch checklist.

---

## What is ChurnShield?

AI-native subscription retention SaaS for small SaaS founders, indie hackers, and solo founders.

**Business model:** 15% commission on retained MRR. Zero charge if nothing is saved. Fee basis and timing varies by offer type  always based on what the subscriber actually pays going forward.
**Core differentiator vs Churnkey ($299-$599/mo flat):**
- No flat fee  performance only
- Self-serve signup (no demo required)
- Proactive churn prediction BEFORE user clicks cancel
- Live AI conversation vs static offer modals

---

## Monorepo Structure

```
chrun/
├── apps/
│   ├── web/          # Next.js 14, Clerk v5, Prisma, Supabase
│   └── agents/       # FastAPI, LangGraph, APScheduler, asyncpg
├── PROJECT_STATUS.md
├── ChurnShield_Product_Document.docx
└── .gitignore
```

---

## Tech Stack (As Built)

### Web (`apps/web`)
- Next.js 14 (App Router), TypeScript
- Clerk v5 (`@clerk/nextjs ^5.7.5`)  auth + webhooks
- Prisma ORM + Supabase (PostgreSQL); **pgvector** used from raw SQL for digest similarity (when extension + `embedding` column exist)
- Vercel AI SDK `streamText`  streaming cancel chat; **`generateText`**  AI Analyst
- Claude Sonnet `claude-sonnet-4-6`  cancel flow agent
- **Voyage AI** `voyage-3-lite`  query embeddings for AI Analyst (optional `VOYAGE_API_KEY`; must match agents’ digest embeddings)
- Claude Haiku `claude-haiku-4-5-20251001`  emails + digests
- Svix  Clerk webhook signature verification
- Recharts  dashboard charts
- Resend  transactional email

### Agents (`apps/agents`)
- FastAPI + Uvicorn (port 8001 locally)
- LangGraph  feedback analyser 6-node pipeline
- LangChain Anthropic  Claude Haiku for AI emails
- scikit-learn TF-IDF + KMeans  feedback clustering
- APScheduler  4 cron jobs (no Redis/BullMQ needed)
- asyncpg  direct Postgres (rightmost-@ URL parser, SSL required)
- Resend  email delivery
- uv  package manager

### Key decisions vs product doc
| Product doc said | What we built | Reason |
|-----------------|---------------|--------|
| CrewAI | LangGraph only | Avoided langchain-core dep conflicts |
| BullMQ + Redis | APScheduler in-process | Simpler, no extra infra at MVP |
| OpenAI embeddings | TF-IDF + KMeans | Cost savings, works fine |
| 20% fee (was wrong) | 15% fee | Fixed to match product doc §3 |
| Flat 15% on gross MRR | 15% of retained MRR (post-discount) | Fair to merchant  effective rate always 15% |

---

## Database Schema (Supabase)

| Table | Key Columns |
|-------|------------|
| `tenants` | id, name, clerkUserId, clerkOrgId, snippetKey, stripeConnectId, ownerEmail, **offer_settings** (JSON: maxDiscountPct, allowPause, allowFreeExtension, allowPlanDowngrade, customMessage) |
| `stripe_events` | id, tenantId, stripeEventId, type, payload, processed, livemode |
| `save_sessions` | sessionId, tenantId, triggerType, subscriberId, subscriptionMrr, offerMade, **offerType** (pause\|extension\|discount\|downgrade\|empathy), offerAccepted, outcomeConfirmedAt, savedValue, feeCharged, **feeBilledAt** (set when monthly Vercel sweep charges or when row closed with no fee), **stripeChargeId** (Stripe PaymentIntent id from that sweep), transcript, **pendingOffer** (JSON  structured offer from `makeOffer` tool, written in `onFinish`; migration `20260404120000_pending_offer`) |
| `churn_predictions` | id, tenantId, subscriberId, riskScore, riskClass, features, predictedAt |
| `feedback_digests` | id, tenantId, periodDays, transcriptCount, clusters, digestText |
| `payment_retries` | id, tenantId, stripeEventId, invoiceId, customerId, customerEmail, failureClass, delayHours, attempts, maxAttempts, nextRetryAt, status, lastError |

---

## Charge Model

### What we charge  15% of what the subscriber actually pays going forward

| Offer | Subscriber pays going forward | ChurnShield fee |
|-------|------------------------------|-----------------|
| Empathy (no offer needed) | Full MRR | 15% of full MRR |
| Pause (1 month break) | Full MRR (resumes after pause) | 15% of full MRR |
| Free extension (1-2 weeks free) | Full MRR (after free period) | 15% of full MRR |
| 10% discount | 90% of MRR | 15% of 90% MRR |
| 25% discount | 75% of MRR | 15% of 75% MRR |
| 40% discount | 60% of MRR | 15% of 60% MRR |
| Plan downgrade | New plan MRR | 15% of new plan MRR |

**Merchant's effective rate is always exactly 15%**  regardless of offer type.

### When the fee is **finalized** vs when the tenant is **charged**

| Offer | Outcome / fee finalized (DB) | Tenant charged (Stripe Connect) |
|-------|------------------------------|----------------------------------|
| **Empathy** | At save: `cancel-outcome` sets `outcome_confirmed_at` + fee | **Monthly** Vercel **`billing-sweep`** (1st, 06:00 UTC) |
| **Pause** | Provisional fee on save; **`invoice.paid`** after pause → **`stripe_worker`** sets `outcome_confirmed_at` + fee from invoice | **Monthly** `billing-sweep` |
| **Extension** | **`invoice.paid`** → **`stripe_worker`** | **Monthly** `billing-sweep` |
| **Discount** | Provisional fee on save; **`stripe_worker`** adjusts from **`invoice.paid`** | **Monthly** `billing-sweep` |
| **Downgrade** | Provisional fee on save; **`stripe_worker`** from **`invoice.paid`** | **Monthly** `billing-sweep` |

**If the subscriber never pays** (e.g. accepts discount then churns before a confirming `invoice.paid`): `outcome_confirmed_at` stays null → row is **not** picked up by `billing-sweep` (requires confirmed outcome + `fee_charged` > 0).

### Python 30-day job (`billing.py`)

- Targets **pause / empathy** (and legacy untyped) with **`outcome_confirmed_at` ≥ 30 days ago**, **`fee_billed_at`** null, **`fee_charged`** > 0.
- **Churned** (sub not active in Stripe): nulls save value + fee, sets **`fee_billed_at`** to close the row (**no** PI).
- **Still active**: does **not** create a Stripe charge; leaves billing to **Vercel** `billing-sweep`.

### Other rules

- **Supersede rule**  On a new **`saved`** outcome, older **unbilled** `save_sessions` for the same tenant + subscriber are voided so merchants are not fee’d twice.
- **Dashboard**  **Billing** page shows **charge history** grouped by **`stripe_charge_id`**; **Recent sessions** remains the per-save operational view.

### Real dollar example ($100/month subscriber)

| Offer | Subscriber pays | ChurnShield earns | Merchant nets |
|-------|----------------|-------------------|---------------|
| Empathy | $100 | $15.00 | $85.00 |
| Pause | $100 (resumes) | $15.00 | $85.00 |
| Extension | $100 | $15.00 | $85.00 |
| 10% off | $90 | $13.50 | $76.50 |
| 25% off | $75 | $11.25 | $63.75 |
| 40% off | $60 | $9.00 | $51.00 |
| Downgrade to $49 | $49 | $7.35 | $41.65 |

---

## AI Usage Map

| Feature | Model | Location |
|---------|-------|----------|
| Cancel chat (streaming) | `claude-sonnet-4-6` | `apps/web/src/lib/cancel-agent.ts` (merchant allowlist, one offer per message, Settings-driven) |
| AI Analyst answer | Claude via Vercel AI SDK (`generateText`) | `apps/web/src/app/api/feedback/search/route.ts` |
| Digest query embedding (semantic retrieval) | Voyage **`voyage-3-lite`** (512-d, `input_type: query`) | `apps/web/src/lib/voyage-embed.ts` (digests stored by agents with `input_type: document`) |
| Payment recovery email | `claude-haiku-4-5-20251001` | `apps/agents/.../payment_recovery.py` |
| Proactive outreach email | `claude-haiku-4-5-20251001` | `apps/agents/.../outreach.py` |
| Feedback cluster summary | `claude-haiku-4-5-20251001` | `apps/agents/.../feedback_analyser.py` |
| Weekly digest compose | `claude-haiku-4-5-20251001` | `apps/agents/.../feedback_analyser.py` |
| Churn scoring | None (heuristic) | `apps/agents/.../churn_prediction.py` |

**Churn score formula:** `0.40 × failed_payments + 0.35 × cancel_attempts + 0.25 × inactivity`
- High risk ≥ 0.60, Medium ≥ 0.30, Low < 0.30

---

## Cron Jobs

### Vercel (`apps/web/vercel.json`)

| Path | Schedule | What it does |
|------|----------|--------------|
| `/api/cron/webhook-cleanup` | Daily 03:00 UTC | Deletes old `webhook_deliveries` (15+ days). **`CRON_SECRET`** |
| `/api/cron/billing-sweep` | **1st of month 06:00 UTC** | **Only** production Stripe charges to tenants: bundles eligible `save_sessions` per tenant, one PI per tenant. **`CRON_SECRET`** |

### Railway / APScheduler (`apps/agents`)

| Job | Schedule | What it does |
|-----|----------|-------------|
| Churn prediction | Daily 02:00 UTC | Scores all subscribers, triggers outreach + high-risk alert email to merchant |
| Feedback digest | Mon 03:00 UTC | LangGraph pipeline, emails merchant weekly digest |
| Payment retry sweep | Every 1 hour | Claims due retries, calls `stripe.Invoice.pay()`, sets payment wall on exhausted |
| Billing sweep (`billing.py`) | Daily 04:00 UTC | **30-day** check on pause/empathy-style rows: void fee if churned; **does not** create Stripe charges (monthly Vercel job bills) |
| Monthly billing summary | 1st of month 05:00 UTC | Aggregates 30-day **billed** fees per merchant, emails summary |
| Payment recovery summary | Mon 04:30 UTC | Weekly retry stats per merchant, emails update |

---

## What Is Fully Done ✅

### Web App
- [x] Clerk auth  sign-in, sign-up, middleware, public/protected routes
- [x] Auto-create tenant on Clerk `user.created` webhook (+ fallback on first dashboard visit)
- [x] Clerk `user.updated` webhook  syncs `ownerEmail` automatically when merchant changes email in Clerk
- [x] Dashboard overview  save rate, MRR saved, fees earned, high-risk count
- [x] Dashboard charts  save rate over time, MRR saved per day, risk distribution (Recharts)
- [x] Subscriber health page (`/dashboard/subscribers`)  per-subscriber risk score table with progress bars
- [x] Recent Sessions (`/dashboard/sessions`)  filterable table (search, outcome, offer type, dates); up to 500 rows loaded server-side; `sessions-table.tsx` client component
- [x] Settings page  workspace rename, notification email display (read-only, synced from Clerk), embed snippet, Stripe Connect, **retention offer controls** (`offer_settings`: max discount %, pause / extension / downgrade toggles, custom Claude message)
- [x] Nav  Overview | Subscribers | **Recent Sessions** | **Billing** | **Feedback** | Settings
- [x] **Billing** (`/dashboard/billing`)  Charge history **one row per** `stripe_charge_id`; upcoming fees (Queued / Confirming); pills for charged this month + queued total + awaiting confirmation; copy explains monthly UTC billing
- [x] AI Analyst  `POST /api/feedback/search`: hybrid **pgvector + keyword** digest pick; prompt uses **`offer_made`** / **`saved_value`**; optional **`VOYAGE_API_KEY`**; **`traceId`** logging + response field
- [x] Cancel chat API (`/api/public/cancel-chat`)  system prompt from **merchant allowlist** + MRR-tier discount cap + churn context; streams Claude Sonnet
- [x] Cancel outcome API (`/api/public/cancel-outcome`)  records save/cancel, `offerType`-aware fee fields; **applies Stripe** (discount coupon + flexible `discounts[]`, extension credit, pause) on connected account; **supersedes** prior unbilled saves for same subscriber
- [x] Pause wall API (`/api/public/pause`)  finds active Stripe sub, pauses via `mark_uncollectible`, records session
- [x] Subscriber status API (`/api/public/subscriber-status`)  returns `paymentWallActive` + `pauseWallActive` flags
- [x] Embed grace mode  `embedSecretActivated` flag; `cancel-intent` allows unsigned requests until merchant rotates secret; wrong hash always rejected; `X-ChurnShield-Warning: embed_unsigned` header + JSON hint in grace mode
- [x] Embed HMAC auth  `Tenant.embedAppId` (`cs_app_...`) + `Tenant.embedHmacSecret`; auto-generated on settings load; `cancel-intent` verifies `authHash = HMAC-SHA256(secret, subscriberId)` hex  missing/invalid → 401 when activated
- [x] `EmbedSigningControls`  "Rotate embed secret" button → POST `/api/dashboard/embed-hmac`; copy-once yellow banner; expandable Next.js signing example
- [x] `findTenantByPublicEmbedId()`  resolves `cs_app_...` or `cs_live_...` to tenant
- [x] `verifyEmbedAuthHash()`  constant-time HMAC comparison
- [x] Prisma schema  `Tenant`, `StripeEvent`, `SaveSession` + `TriggerType` enum; Prisma **6.x** pinned; `build` runs `prisma generate` first; npm scripts `db:generate`, `db:migrate`, `db:push`, `db:studio`
- [x] Initial migration  `prisma/migrations/20260327120000_init/migration.sql`; UUID defaults via `gen_random_uuid()`
- [x] `src/lib/db.ts`  Prisma singleton (prevents hot-reload from opening multiple connections)
- [x] Cancel intent API (`/api/public/cancel-intent`)  POST with `snippetKey`, `subscriberId`, optional `subscriptionMrr`; CORS *; creates `save_sessions` row (`cancel_attempt`)
- [x] Stripe webhook ingress  Svix verified, idempotent
- [x] Clerk webhook handler  auto-creates tenant on `user.created` + `organization.created`, syncs email on `user.updated`
- [x] cs.js embed  `data-key`, optional `data-api-base` / `data-cancel-selector`, capture-phase click handler; intercepts cancel clicks, streaming AI chat overlay, **markdown** in bubbles, **typing** indicator, outcome buttons (Keep / Cancel), **`detectOffer`** → `offerType`/`discountPct`, **re-fire** merchant cancel on exit / “still cancel”; dispatches `churnshield:cancel-intent` event
- [x] `window.ChurnShield.identify({ subscriberId, subscriptionMrr })`  triggers status check on call
- [x] `window.ChurnShield.pauseWall()`  shows pause modal, calls `/api/public/pause`, closes on success
- [x] `window.ChurnShield.isPaymentWallActive()`  returns bool; fires `churnshield:payment-wall-active` event
- [x] Production rate limiting  Upstash Redis + sliding window on all 5 public endpoints (fails open in dev)
- [x] Input bounds  `subscriptionMrr` capped at $10k, `subscriberId`/`sessionId` max 255 chars on all endpoints
- [x] TypeScript errors fixed  `cancel-outcome` variable scope, `charts.tsx` Recharts formatter types
- [x] **Clerk hydration**  `src/components/clerk-auth-header.tsx` (client mount gate for `SignedIn` / `UserButton` in root `layout.tsx`)
- [x] **`public/test-app/index.html`**  local QA page wired to `cs.js` + demo `identify`; `USE_REAL_APIS` + `TEST_CONFIG`; **`defer`** for `cs.js` (not `async`) so `data-key` is applied before init
- [x] Deployment files  `Dockerfile`, `railway.toml`, `vercel.json`

### Python Agents
- [x] `config.py`  Pydantic Settings loading `DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_*` from `.env`
- [x] FastAPI server with `/health` endpoint (checks DB, Stripe, email, AI)
- [x] asyncpg connection pool  SSL, rightmost-@ URL parsing (handles special chars in password); `lifespan` opens/closes pool
- [x] `tenant_id_for_stripe_account(acct_id)`  resolves Stripe Connect account → `tenants.id` via `stripe_connect_id`
- [x] Stripe webhook processor  verifies `Stripe-Signature`, stores full event JSON in `stripe_events`, schedules `BackgroundTask` to process (fast 200 for Stripe)
- [x] **`stripe_worker.handle_invoice_paid`**  confirms **extension / discount / downgrade / pause** from `invoice.paid` (fee + `outcome_confirmed_at`); **does not** charge Connect; respects `offer_accepted` (superseded rows excluded)
- [x] Churn prediction  fetch → score → store → proactive outreach for high-risk
- [x] Feedback analyser  LangGraph 6-node pipeline (fetch→extract→cluster→summarize→compose→store)
- [x] Payment recovery  AI email + retry scheduling per failure class
- [x] Proactive outreach  AI email, stored as save_session (trigger_type='prediction_outreach')
- [x] Payment retry sweep  claims due rows, calls `stripe.Invoice.pay()`, advances/exhausts
- [x] Payment wall  sets `payment_wall_active = true` in `subscriber_flags` when retries exhausted
- [x] 30-day billing confirmation (`billing.py`)  checks Stripe subscription still active; voids churned saves; **no** Connect charge in this job
- [x] **Tenant charges**  **`PaymentIntent.create`** only in **`apps/web`** `GET /api/cron/billing-sweep` (Vercel monthly cron), not in Python billing sweep
- [x] Weekly digest email  sent to merchant's `ownerEmail` after digest is generated
- [x] **High-risk alert email** (#4)  after daily churn scoring, emails merchant if any high-risk subscribers found
- [x] **Monthly billing summary email** (#5)  1st of month cron, aggregates 30-day fees per merchant
- [x] **Save confirmation email** (#6)  was wired to Python sweep; **removed** from `billing.py` loop (buggy / duplicate-send risk). Merchants see fees on **Dashboard → Billing** + monthly summary email
- [x] **Payment recovery weekly summary** (#7)  Mon 04:30 UTC, retry stats per merchant
- [x] Shared `merchant_email.py`  `get_owner_email()` + `send_merchant_email()` used by all agent emails
- [x] UUID generation  all inserts generate IDs in Python (DB defaults not reliable with asyncpg)
- [x] Email fix  `asyncio.to_thread(resend.Emails.send, ...)` (resend v2 is sync-only)
- [x] Manual trigger endpoints  `POST /agents/churn-prediction`, `/agents/feedback-digest`, `/agents/billing-sweep`

---

## What Is NOT Done Yet ❌

### High Priority (do before launch)
| # | Feature | How to implement |
|---|---------|-----------------|
| 1 | **Deploy  Vercel + Railway** | Push repo to GitHub → connect Vercel to `apps/web` → connect Railway to `apps/agents` (uses Dockerfile). Add all env vars. See env vars section below. |
| 2 | **Production Stripe webhook** | After Railway deploy, register `https://[railway-url]/webhooks/stripe` in Stripe dashboard → Events: `invoice.payment_failed`, `invoice.payment_succeeded`, `customer.subscription.deleted`. Copy signing secret → `STRIPE_WEBHOOK_SECRET` in Railway env vars. |
| 3 | **Stripe Connect OAuth** ✅ | `/api/stripe/connect/start` (Clerk-auth, HMAC-signed state) + `/api/stripe/connect/callback` (exchanges code, saves `stripeConnectId`). Settings page wired. Add `STRIPE_CLIENT_ID` from Stripe Dashboard → Connect → Settings. |

### Medium Priority  Merchant Emails ✅ ALL DONE

| # | Feature | Status |
|---|---------|--------|
| 4 | **High-risk alert email** | ✅ `churn_prediction.py`  after scoring loop |
| 5 | **Monthly billing summary email** | ✅ `billing.py`  1st of month cron (05:00 UTC) |
| 6 | **Save confirmation email** | ⚠️ **Billing** dashboard + monthly summary; per-row email removed from `billing.py` (was broken/noisy) |
| 7 | **Payment recovery weekly summary** | ✅ `payment_recovery.py`  Mon 04:30 UTC cron |
| 8 | **Pause wall** | ✅ `window.ChurnShield.pauseWall()` + `POST /api/public/pause` |
| 9 | **Payment wall** | ✅ `subscriber_flags` table + `GET /api/public/subscriber-status` + queue.py sets on exhausted retries |
| 10 | **Merchant email in settings** | ✅ Read-only display in settings; auto-synced from Clerk via `user.updated` webhook |

### Owner Email  Current State
| | Status |
|-|--------|
| Captured from Clerk webhook on signup | ✅ |
| Backfilled on first dashboard visit if missing | ✅ |
| Auto-synced when merchant changes email in Clerk | ✅ |
| Used for weekly feedback digest email | ✅ |
| High-risk alert emails | ✅ |
| Monthly billing summary email | ✅ |
| Save confirmation email to merchant | ⚠️ Use **Billing** UI + monthly summary (Python sweep email removed) |
| Payment recovery update email | ✅ |

**Why owner email matters:** Merchants receive value passively  weekly digests, high-risk alerts, billing receipts  without logging in. This is the core pitch vs Churnkey ($299/mo flat, no proactive emails).

### Post-MVP
| # | Feature | How to implement |
|---|---------|-----------------|
|  | **Hybrid retention offers** (e.g. pause then % off on resume) | Single `offerType` + today’s `applyStripeOffer` cannot apply timed sequences. Needs new type (e.g. `pause_then_discount`), webhook or cron when pause ends, or Stripe Subscription Schedule; align `detectOffer` + prompt. |
| 8 | **Multi-language** | In `cancel-chat` route, detect `Accept-Language` header or `navigator.language` from cs.js. Add language to system prompt: "Respond in {language}." |
| 9 | **Natural language feedback search** | ✅ **Done (April 2026)**  Hybrid pgvector + keyword in `/api/feedback/search`; agents already embed digests with Voyage `voyage-3-lite`; web embeds queries with same model. *(Original note: OpenAI `text-embedding-3-small` was an alternative; not used  keep Voyage for space alignment.)* |
| 10 | **A/B test offers** | `offerType` column already in `save_sessions` ✅. Build analytics query in dashboard  which offer type wins per MRR tier. |
| 11 | **Trained ML churn model** | Once 500+ labelled sessions exist, train sklearn LogisticRegression on (cancel_attempts, failed_payments, days_inactive) → save to model.pkl → load in churn_prediction.py. |
| 12 | **Test coverage** | Unit: pytest for agents (mock Stripe + DB). E2E: Playwright for cancel flow. AI evals: Claude-graded tests for offer quality. |
|  | **Optional: coupon cleanup job** | Archive/delete orphaned unused `churnshield_ret_*` coupons on Connect accounts (Stripe API + care with attached subs). |

---

## Feature roadmap  competitive / growth ideas

**Narrow the gap** vs Churnkey-style mid-market products (analytics, integrations, enterprise). **Widen the wedge** for indie/SMB (performance pricing, AI depth, low friction).

**Status:** **Done** = in repo (may still need prod env/DB). **Not done** = not built.

| Idea | Why it matters vs Churnkey / category | Fit with current product | Status |
|------|----------------------------------------|---------------------------|--------|
| **A/B or “offer performance” dashboard** | Churnkey leans on optimization; you already store `offer_type` + outcomes | High  mostly analytics on `save_sessions` | **Done**  `/dashboard/offer-analytics` page + `/api/dashboard/offer-analytics` route; period toggle (All / 30d / 90d); Recharts bar chart; per-offer save rate, avg MRR, total MRR saved; sidebar link added |
| **pgvector / semantic “ask your feedback”** | Beats keyword-only digest retrieval; “ask your data” story | Medium effort when building; clear upsell for AI Analyst | **Done**  hybrid digest retrieval + `VOYAGE_API_KEY` (`voyage-embed.ts`, `feedback-digest-retrieval.ts`) |
| **i18n for cancel chat** | Table stakes as you grow outside EN | Medium  prompt + `cs.js` / `Accept-Language` | **Done**  `navigator.language` sent from `cs.js` as `locale`; sanitised in `cancel-chat` route; `buildCancelAgentSystem` injects language instruction into system prompt for non-EN locales |
| **Structured tools in cancel-chat** (`makeOffer`, apply Stripe paths) | Fewer mismatches vs `detectOffer` heuristics | High impact on reliability | **Done**  `makeOfferTool` in `cancel-agent.ts`; `pending_offer` JSON column on `save_sessions`; `resolveBillingOfferFromSession` prefers DB over client body; `detectOffer` heuristic retired from `cs.js`; cancelled outcomes with `pending_offer` record offered-but-rejected type. Remaining gap: no guarantee model always calls the tool (no AI eval enforcement yet) |

| **Webhooks or Zapier** (“save created”, high-risk, digest) | Mid-market expects integrations | Email-heavy today; webhooks complement | **Not done** |
| **Slack alerts** (saves, high-risk) | Low friction for founders | Small surface, high perceived value | **Done**  incoming webhook URL saved on tenant (`slack_webhook_url`); save alert fires from `cancel-outcome`; high-risk alert fires from `churn_prediction.py`; Settings UI card with validation. Discord: **Not done** |
| **CSV export** (sessions, subscribers) | Trust + ops; category norm | Easy win on existing tables | **Done**  Sessions: client-side export of filtered rows in `sessions-table.tsx`; Subscribers: `/api/dashboard/export/subscribers` GET route + `ExportSubscribersButton` component on subscribers page |
| **Configurable digest window + daily digest / weekly email** | Fresher analyst without inbox spam | Scheduling + `send_email` flag + retention policy | **Not done** |
| **Skip digest when no new transcripts** | Cost control at scale | Agents + DB watermark or hash | **Done**  `_check_watermark` node in `feedback_analyser.py`; queries last digest `created_at`, counts new transcripts since then; skips entire LangGraph pipeline with `reason: no_new_transcripts_since_last_digest` |
| **Digest row retention / prune** | DB size if digest runs often | Cron or delete-on-insert cap | **Not done** |
| **Tests + staging hardening** | Competitors sell “enterprise-ready” | Critical for credibility at scale | **Not done**  Post-MVP #12  see § Test Coverage Plan below |
| **Trained ML churn model** | Better than heuristic scoring | Needs labelled volume | **Not done**  Post-MVP #11 |
| **Coupon cleanup job** | Stripe hygiene on Connect accounts | Optional maintenance | **Not done** |
| **SOC2 / security page / audit log** | Mid-market procurement | Post-wedge; not day-one for indie ICP | **Not done** |
| **Recent Sessions filterable UI** | Readability for merchants | Dashboard + inline styles | **Done** |
| **AI Analyst: `offer_made` + saved value in prompt** | Answers match DB vs “not captured” | Small change, high trust | **Done** |
| **AI Analyst `traceId` logging** | Support / debug | Route + retrieval + Voyage | **Done** |
| **Feedback UI focus after “New conversation”** | Polish | `forwardRef` + `inputRef` | **Done** |

**Double down (fewer random bets):** offer analytics, stronger grounding (tools + embeddings you have), integrations (webhooks / Slack), export.

---

## § Test Coverage Plan
*Full endpoint inventory in `TEST_PLAN.md`. This section is the actionable working plan.*

### Priority 1  Must have before first paying merchant (money + security)

These are the only tests that can cause financial or security damage if they fail silently.

| # | What to test | File / function | Why critical |
|---|---|---|---|
| T1 | `resolveBillingOfferFromSession`  prefers `pending_offer` over client body | `cancel-agent.ts` | Wrong offer type = wrong Stripe coupon = merchant dispute |
| T2 | `resolveBillingOfferFromSession`  clamps `discountPct` to MRR tier + merchant ceiling | `cancel-agent.ts` | Overpaying discount if unclamped |
| T3 | `resolveBillingOfferFromSession`  falls back to empathy when `pending_offer` invalid | `cancel-agent.ts` | Should never crash; safe default |
| T4 | `applyStripeOffer`  discount path creates coupon + attaches to subscription | `cancel-outcome/route.ts` | Core save action |
| T5 | `applyStripeOffer`  pause path sets `pause_collection: mark_uncollectible` | `cancel-outcome/route.ts` | Core save action |
| T6 | `applyStripeOffer`  extension path creates negative balance transaction | `cancel-outcome/route.ts` | Core save action |
| T7 | `applyStripeOffer`  empathy/downgrade returns `applied: false`, no Stripe call | `cancel-outcome/route.ts` | Correctness |
| T8 | HMAC auth on `cancel-intent`  wrong hash → 401 | `cancel-intent/route.ts` | Security boundary |
| T9 | HMAC auth on `cancel-intent`  grace mode (unactivated) allows unsigned with warning | `cancel-intent/route.ts` | Regression guard |
| T10 | HMAC auth on `cancel-intent`  activated + no hash → 401 `auth_hash_required` | `cancel-intent/route.ts` | Security boundary |
| T11 | Monthly **`billing-sweep`** fee bundle + **`PaymentIntent.create`** on Connect | `apps/web/.../billing-sweep/route.ts` | Tenant charge correctness |
| T12 | `stripe_worker.handle_invoice_paid`  confirms deferred offer, stamps fee (no Connect charge) | `stripe_worker.py` | Outcome/fee recognition before monthly bill |
| T13 | Double fee guard  `saved` outcome voids older unbilled rows for same subscriber | `cancel-outcome/route.ts` | Prevents double charge |

**How to run (when written):**
```bash
# TypeScript unit tests (cancel-agent logic  no DB needed)
cd apps/web && npx vitest run src/lib/cancel-agent.test.ts

# Python unit tests (mock Stripe + asyncpg)
cd apps/agents && uv run pytest tests/ -v
```

---

### Priority 2  Important but not blocking first merchant

| # | What to test | Notes |
|---|---|---|
| T14 | `cancel-chat` injection filter  blocked patterns replaced with placeholder | Input sanitisation |
| T15 | `cancel-chat` forged assistant message dropped | Security |
| T16 | `cancel-chat` rate limit  429 after limit hit | Abuse prevention |
| T17 | `cancel-outcome`  duplicate call with `outcomeConfirmedAt` set returns `alreadyRecorded` | Idempotency |
| T18 | `cancel-outcome`  `cancelled` outcome with `pending_offer` writes `offerType` (rejection log) | Analytics correctness |
| T19 | Clerk webhook `user.created` → tenant auto-provisioned with `embedAppId` | Onboarding |
| T20 | Stripe Connect callback  stores `stripeConnectId`, rejects tampered state | Auth |
| T21 | `feedback_analyser` watermark  skips run when no new transcripts since last digest | Cost control |
| T22 | `churn_prediction`  heuristic scoring produces `high/medium/low` for expected inputs | Scoring correctness |

---

### Priority 3  Polish / post-revenue

| # | What to test |
|---|---|
| T23 | Dashboard metrics query  correct counts per tenant, no cross-tenant leakage |
| T24 | CSV export  correct headers, correct row count |
| T25 | Offer analytics  save rate, avg MRR, bestOffer computed correctly |
| T26 | Embed HMAC secret rotation  `embedSecretActivated` flips to true |
| T27 | `getOrCreateRetentionCoupon`  reuses existing coupon with same shape |
| T28 | `nonChurnShieldDiscountUpdateParams`  keeps non-ChurnShield discounts, drops retention ones |

---

### E2E (Playwright)  when you have a staging env

```
Cancel flow happy path:
  1. Load test-overlay.html
  2. Click cancel → overlay opens → chat loads
  3. Send "too expensive" → wait for offer message
  4. Click "Keep my subscription"
  5. Assert cancel-outcome returned ok:true + offerType set
  6. Assert Stripe test-mode subscription has coupon attached

Cancel flow  subscriber declines:
  1. Click "I still want to cancel"
  2. Assert original cancel re-fired (_bypassNext)
  3. Assert save_sessions row has offerAccepted: false
```

---

### Staging environment setup (when ready)

| Step | What |
|---|---|
| 1 | Create separate Supabase project for staging; run all migrations |
| 2 | Separate Railway environment (staging branch auto-deploys) |
| 3 | Stripe test-mode account  use test keys only in staging |
| 4 | Separate Clerk app for staging (or use same with test users) |
| 5 | `NEXT_PUBLIC_ENV=staging` banner in dashboard UI so it's obvious |
| 6 | Smoke test script: hit `/health`, create a session, run cancel flow, assert outcome |

**When to build staging:** after your second active merchant. Before that, localhost + Stripe test mode is sufficient.

---

## Advanced Features (Post-Launch, Not Day-One)

These two features are **already built in code** (`cs.js` + Python agents) but intentionally removed from the Integration page. They are not needed for the core cancel flow to work. Add them once merchants are live and asking for more control.

---

### Advanced Feature 1  Pause Wall (`window.ChurnShield.pauseWall()`)

#### What it is
A proactive pause modal the **merchant triggers manually** from their own UI  before the subscriber ever clicks cancel. When called, it shows "Want to pause instead of cancel?" and calls `/api/public/pause` directly, bypassing the AI chat entirely.

#### How it works
```
Merchant calls window.ChurnShield.pauseWall()
        ↓
cs.js shows a modal: "Pause your subscription for 1 month?"
        ↓
Subscriber clicks "Pause"
        ↓
cs.js → POST /api/public/pause → Stripe mark_uncollectible on the subscription
        ↓
save_session row created (trigger_type = cancel_attempt, offerType = pause)
        ↓
30-day billing sweep: if subscription still active after 30 days → ChurnShield charges 15% fee
```

#### Why it exists
Some merchants want to offer pause as a **proactive self-service option** (e.g. a "Take a break" button on their billing page) rather than waiting for a subscriber to click cancel. This intercepts churn earlier than the cancel flow.

#### Why it’s NOT needed day-one
- The AI cancel chat **already offers pause** when "Allow subscription pause" is toggled on in Retention Offer Settings
- Two paths to the same outcome (pause) adds confusion during onboarding
- The merchant has to decide *where* in their UI to place the call  every product is different
- Most indie hackers don’t have a billing page sophisticated enough to warrant this

#### What makes it different from Stripe’s native pause
| | Stripe native pause | ChurnShield pauseWall() |
|---|---|---|
| Triggered by | Merchant support team / billing portal | Subscriber self-service at moment of cancel intent |
| Saves the subscriber | Maybe, if they find it | Yes  intercepts the cancel click proactively |
| Recorded in ChurnShield | No | Yes  full save_session, fee after 30 days |

#### When to add it (post-launch signal)
Merchants ask: *"Can subscribers pause without going through the chat?"* or *"I want a pause button on my billing page."*

#### How to expose it to merchants
Add a new section to the Integration page (`/dashboard/integration`) under an "Advanced" accordion or tab. Show:
```js
// Place this wherever you want to offer pause proactively
window.ChurnShield.pauseWall();
```
Note: `identify()` must be called first. Requires "Allow subscription pause" to be ON in Retention Offer Settings.

---

### Advanced Feature 2  Payment Wall (`window.ChurnShield.isPaymentWallActive()`)

#### What it is
A flag check that returns `true` when ChurnShield’s Python agent has determined a subscriber’s payment has **permanently failed** (all retries exhausted). The merchant’s app reads this flag and decides what to show  a hard block, a banner, a redirect.

#### How it works
```
Stripe fires invoice.payment_failed
        ↓
Python stripe_worker receives it
        ↓
Maps Stripe error code → failure_class:
  card_declined       → retry after 1h, 24h, 72h
  insufficient_funds  → retry after 3d, 7d, 14d
  expired_card        → retry after 24h, 72h (likely won’t succeed)
  do_not_honor        → retry after 1h, 24h
        ↓
Payment retry sweep (every 1h) calls stripe.Invoice.pay()
        ↓
All retries exhausted, still failed
        ↓
Python agent sets subscriber_flags.payment_wall_active = true
        ↓
cs.js → GET /api/public/subscriber-status → returns { paymentWallActive: true }
        ↓
window.ChurnShield.isPaymentWallActive() returns true
Fires churnshield:payment-wall-active event
```

#### Why it exists
Without this, a subscriber with a permanently failed payment either:
1. Keeps using the product for free (merchant loses MRR silently)
2. Gets cut off by Stripe’s dunning with no soft landing

ChurnShield’s flag gives the merchant a **programmatic hook** to show a card-update prompt at the right moment, without the merchant having to build their own Stripe webhook handler.

#### Why it’s NOT needed day-one
- Stripe already handles payment failure with its own built-in dunning (smart retries + email)
- Most indie hackers at launch don’t have enough failed payments to warrant custom retry logic
- The merchant’s app may already handle this via Stripe’s customer portal
- It requires the merchant to wire the flag into their own UI  non-trivial decision

#### What makes it different from Stripe’s built-in dunning
| | Stripe built-in dunning | ChurnShield payment wall |
|---|---|---|
| Retry timing | Fixed smart retry schedule | Customized per failure_class |
| Recovery email | Generic Stripe email | AI-written via Claude Haiku, personalized |
| After exhaustion | Cancels subscription or marks past due | Sets `payment_wall_active` flag  merchant controls the UX |
| Merchant effort | Zero | Must wire `isPaymentWallActive()` into their app |

#### When to add it (post-launch signal)
Merchants ask: *"How do I block access when a payment fails?"* or *"I’m getting too many free riders with failed payments."*

#### How to expose it to merchants
Add to the Integration page Advanced section:
```js
// After identify()  check on every page load
const blocked = window.ChurnShield.isPaymentWallActive();
if (blocked) {
  window.location.href = "/billing/update-card";
}

// Or listen for the event (fires automatically after identify())
window.addEventListener("churnshield:payment-wall-active", () => {
  showUpdateCardModal();
});
```
Note: The Python agents must be deployed and `STRIPE_WEBHOOK_SECRET` configured for the flag to ever be set.

---

## Environment Variables

### `apps/web/.env`
```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_CLIENT_ID=ca_...                        # Stripe Dashboard → Connect → Settings
STRIPE_CONNECT_REDIRECT_URI=https://[vercel-url]/api/stripe/connect/callback
CHURNSHIELD_ONBOARD_SECRET=[random 32-char hex]  # Signs OAuth state param (CSRF protection)
NEXT_PUBLIC_APP_URL=https://[vercel-url]
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://...upstash.io   # console.upstash.com → Create DB → REST URL
UPSTASH_REDIS_REST_TOKEN=...                   # console.upstash.com → Create DB → REST Token
```

### `apps/agents/.env`
```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
# NOTE: If password contains @, encode as %40 (e.g. pass@word → pass%40word)
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev   # use verified domain in production
```

---

## How to Run Locally

```bash
# Terminal 1  Web app
cd apps/web
npm install
npm run dev
# Runs on http://localhost:3000

# Terminal 2  Python agents
cd apps/agents
uv run churnshield-agents
# Runs on http://localhost:8001
# Docs: http://localhost:8001/docs

# Terminal 3  Ngrok tunnel (for Clerk webhooks)
ngrok http --domain=alphonso-nonjuristic-detersively.ngrok-free.dev 3000
# Clerk webhook URL: https://alphonso-nonjuristic-detersively.ngrok-free.dev/api/webhooks/clerk
```

### Common issues
| Error | Fix |
|-------|-----|
| `pydantic_settings` not found | Run `uv pip install --python .venv/Scripts/python.exe -e ".[dev]"` from `apps/agents` |
| `getaddrinfo failed` | Password has `@`  encode as `%40` in DATABASE_URL |
| `EPERM rename .dll` | Dev server locks Prisma DLL  stop `npm run dev`, run `npx prisma generate`, restart |
| `port 8000 blocked` | Run `taskkill /PID [pid] /F` or use port 8001 (default now) |
| Dashboard shows "No workspace found" | Visit `/dashboard`  auto-creates tenant on first load |
| `database_configured: false` | Check agents `.env` is at `apps/agents/.env`, not inside src folder |
| Clerk **hydration** error (`UserButton` / header) | Root layout uses `ClerkAuthHeader` client wrapper  do not inline `UserButton` in server `layout` without mount gate |
| **No `save_sessions` row** from test page | `test-overlay.html`: use `defer` for `cs.js`; set `data-key` in inline script immediately after tag; `USE_REAL_APIS=true` |
| Stripe **flexible** sub rejects `coupon` on update | Use `discounts: [{ coupon: id }]` + strip prior ChurnShield discounts  see `cancel-outcome/route.ts` |
| **Two retention discounts** on one subscription | Fixed by replacing ChurnShield coupons before attach; old subs may need manual fix in Dashboard |
| **Two merchant save fees** same subscriber | Fixed by supersede `updateMany` on new save; void stale rows with `offer_accepted=false` if needed |

---

## Deploy Checklist (When Ready)

### Vercel (Next.js web app)
1. Push repo to GitHub
2. Vercel → New Project → import repo → Root Directory: `apps/web`
3. Add env vars (all from `apps/web/.env`)
4. Deploy → copy production URL

### Railway (Python agents)
1. Railway → New Project → Deploy from GitHub → Root Directory: `apps/agents`
2. Railway auto-detects `Dockerfile`
3. Add env vars (all from `apps/agents/.env`)
4. Set `PORT=8000` in Railway env (Railway injects `$PORT`)
5. Deploy → copy Railway URL

### Post-deploy
1. Register Stripe webhook: `https://[railway-url]/webhooks/stripe`
2. Update Clerk webhook: `https://[vercel-url]/api/webhooks/clerk`
3. Add `user.updated` to Clerk webhook subscribed events (for email sync)
4. Add Upstash Redis env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) to Vercel
5. Test full flow: signup → embed cs.js → click cancel → AI chat → outcome

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `apps/web/src/app/dashboard/page.tsx` | Dashboard overview with metrics + charts |
| `apps/web/src/app/dashboard/subscribers/page.tsx` | Subscriber health score table |
| `apps/web/src/app/dashboard/settings/page.tsx` | Workspace settings (name, notification email display, snippet, Stripe Connect) |
| `apps/web/src/app/dashboard/charts.tsx` | Recharts client components |
| `apps/web/src/app/dashboard/layout.tsx` | Nav bar layout |
| `apps/web/src/app/api/public/cancel-chat/route.ts` | Streaming cancel AI chat |
| `apps/web/src/app/api/public/cancel-outcome/route.ts` | Save/cancel outcome, Stripe apply (flexible `discounts`, shared coupons, supersede prior saves) |
| `apps/web/src/components/clerk-auth-header.tsx` | Client auth strip; avoids Clerk portal hydration mismatch |
| `apps/web/public/test-overlay.html` | Local cancel-flow test harness (`USE_REAL_APIS`, `TEST_CONFIG`) |
| `apps/web/src/app/api/public/pause/route.ts` | Pause wall  pauses Stripe subscription |
| `apps/web/src/app/api/public/subscriber-status/route.ts` | Returns paymentWallActive + pauseWallActive |
| `apps/web/src/app/api/webhooks/clerk/route.ts` | Tenant creation + email sync (user.created, user.updated, organization.created) |
| `apps/web/src/lib/cancel-agent.ts` | Dynamic system prompt by MRR tier |
| `apps/web/src/lib/voyage-embed.ts` | Voyage `voyage-3-lite` query embeddings for AI Analyst |
| `apps/web/src/lib/feedback-digest-retrieval.ts` | Hybrid pgvector + keyword digest selection |
| `apps/web/src/app/api/feedback/search/route.ts` | AI Analyst POST; digests + session snippets + `generateText` |
| `apps/web/src/app/dashboard/sessions/page.tsx` | Recent Sessions server data |
| `apps/web/src/app/dashboard/sessions/sessions-table.tsx` | Client filters + table |
| `apps/web/src/app/dashboard/billing/page.tsx` | Billing data: `groupBy(stripe_charge_id)` + unbilled sessions |
| `apps/web/src/app/dashboard/billing/billing-table.tsx` | `BillingDashboard`: charge history + upcoming fees tables |
| `apps/web/src/app/api/cron/billing-sweep/route.ts` | **Monthly** tenant billing: one PI per tenant per run |
| `apps/web/src/components/ui/ai-chat-input.tsx` | Chat input (`forwardRef` for focus) |
| `apps/web/src/lib/rate-limit.ts` | Upstash Redis rate limiters for all 5 public endpoints |
| `apps/web/public/cs.js` | Embed snippet  cancel intercept, chat overlay, pauseWall(), payment wall check |
| `apps/web/prisma/schema.prisma` | Full DB schema (includes SubscriberFlag) |
| `apps/agents/src/churnshield_agents/main.py` | FastAPI app entry point |
| `apps/agents/src/churnshield_agents/agents/churn_prediction.py` | Daily risk scoring + high-risk alert email |
| `apps/agents/src/churnshield_agents/agents/feedback_analyser.py` | LangGraph digest pipeline |
| `apps/agents/src/churnshield_agents/agents/payment_recovery.py` | Payment failure handler + weekly summary email |
| `apps/agents/src/churnshield_agents/agents/outreach.py` | Proactive retention emails |
| `apps/agents/src/churnshield_agents/agents/billing.py` | 30-day pause/empathy check (void churned); monthly summary email; **`_charge_via_stripe_connect` unused** |
| `apps/agents/src/churnshield_agents/agents/merchant_email.py` | Shared util  get_owner_email() + send_merchant_email() |
| `apps/agents/src/churnshield_agents/jobs/queue.py` | APScheduler cron jobs (6 total) + payment wall on exhausted retries |
| `apps/agents/src/churnshield_agents/db.py` | asyncpg pool + URL parser |
| `apps/agents/src/churnshield_agents/config.py` | Pydantic settings |
| `apps/agents/src/churnshield_agents/workers/stripe_worker.py` | `handle_invoice_paid`  deferred save **confirm** only (no Connect charge) |

---

## Competitor Analysis  ChurnShield vs Churnkey

### Pricing

| | Churnkey | ChurnShield |
|-|----------|-------------|
| Model | Flat monthly fee | 15% commission on saved MRR only |
| Starter | $299/mo | $0 |
| Growth | $599/mo | $0 |
| Enterprise | Custom | $0 |
| If nothing saved | Still pay $299–$599 | Pay $0 |
| Break-even point | Need to save ~$2,000/mo MRR to justify $299 | No break-even risk |

**Winner: ChurnShield**  zero risk for the merchant. Churnkey costs money even when it fails.

---

### Onboarding

| | Churnkey | ChurnShield |
|-|----------|-------------|
| Demo required | Yes  sales call needed | No |
| Self-serve signup | No | Yes  sign up, get snippet, done |
| Time to first value | Days (sales cycle) | Minutes |
| Setup complexity | High (custom flows, UI builder) | One `<script>` tag |

**Winner: ChurnShield**  built for solo founders who don't want to talk to sales.

---

### Churn Prevention Approach

| | Churnkey | ChurnShield |
|-|----------|-------------|
| Cancel flow | Static modal with offers | Live AI conversation (Claude Sonnet) |
| Offer type | Pre-configured discount/pause options | Dynamic  adapts to MRR tier + risk signals |
| Proactive outreach | ❌ No | ✅ Yes  emails at-risk subscribers before they cancel |
| Payment recovery | Basic retry | AI-written recovery emails + classified retry schedule |
| Churn prediction | ❌ No | ✅ Yes  daily scoring, proactive outreach for high-risk |
| Pause wall | ✅ Yes | ✅ Yes |
| Payment wall | ❌ No | ✅ Yes |

**Winner: ChurnShield**  reactive (cancel flow) + proactive (prediction + outreach). Churnkey is reactive only.

---

### Merchant Communication

| | Churnkey | ChurnShield |
|-|----------|-------------|
| Requires dashboard login to see value | Yes | No |
| Weekly digest emails | ❌ | ✅ AI-generated feedback digest |
| High-risk alert emails | ❌ | ✅ Same day as detection |
| Save confirmation emails | ❌ | ⚠️ Dashboard **Billing** + monthly summary; per-save email removed from Python sweep (was broken/noisy) |
| Monthly billing summary | ❌ | ✅ 1st of every month |
| Payment recovery updates | ❌ | ✅ Weekly |

**Winner: ChurnShield**  merchants get value passively. Churnkey requires you to log in to see what's happening.

---

### Target Customer

| | Churnkey | ChurnShield |
|-|----------|-------------|
| Primary target | Mid-market SaaS ($10k–$100k MRR) | Indie hackers, solo founders, small SaaS (<$10k MRR) |
| Min viable MRR to justify cost | ~$2,000/mo (to cover $299 fee) | $1 (performance only) |
| Sales motion | Sales-led | Product-led |

---

### Summary

| Dimension | Churnkey | ChurnShield |
|-----------|----------|-------------|
| Price risk | High (flat fee) | Zero |
| Onboarding friction | High | Low |
| AI quality | Rule-based modals | Live Claude conversation |
| Proactive retention | ❌ | ✅ |
| Merchant notifications | Minimal | Full passive reporting |
| Target market | Mid-market | SMB / indie |

**ChurnShield's core pitch:** Churnkey charges you $299/mo regardless of results. ChurnShield charges nothing unless a subscriber is saved  and works harder to save them with live AI, proactive outreach, and automated payment recovery.

---

## Cumulative work summary (all sessions to date)

High-level recap of what exists in the repo and what was hardened in recent work. Details live in the sections above; this is the **single “everything built”** checklist at a glance.

### Product & billing
- **15% of retained MRR** only when a save is proven; fee amount follows post-discount / post-offer economics where applicable.
- **Offer types** in `save_sessions.offer_type`: pause, extension, discount, downgrade, empathy  drive confirmation timing and fee basis.
- **Empathy**  `outcome_confirmed_at` + fee at save. **Pause / extension / discount / downgrade**  fee/outcome finalized when **`invoice.paid`** is processed by **`stripe_worker`** (pause included in deferred set). **Discount** can store provisional fee before confirmation; if subscriber never pays, **`outcome_confirmed_at`** stays null → **no** monthly bill line item.
- **Python `billing.py` (daily)**  30-day **verification** for pause/empathy-style rows: void churned saves; **does not** run **`PaymentIntent.create`**.
- **Vercel `billing-sweep` (1st of month 06:00 UTC)**  **Only** place that charges the merchant via Stripe Connect; one payment per tenant per run, grouped `stripe_charge_id` on sessions.
- **Supersede rule**  On a new **saved** outcome, older **unbilled** `save_sessions` for the same tenant + subscriber are voided so merchants are not fee’d twice when the same customer runs through cancel again.

### Web app (`apps/web`)
- **Dashboard**  Overview metrics/charts, Subscribers risk table, **Recent Sessions** (filters, 500-row load), **Billing** (charge history per PI + upcoming fees), **Feedback** (AI Analyst + hybrid digest retrieval + `VOYAGE_API_KEY`), **Settings** (workspace, embed snippet, Stripe Connect, **retention offer limits** via `offer_settings`).
- **Public APIs**  `cancel-intent`, streaming `cancel-chat`, `cancel-outcome`, `pause`, `subscriber-status`; **Upstash** rate limits (fail open locally); input caps on MRR / ids.
- **cancel-outcome**  Writes session; **applies Stripe on Connect**: flexible subs use **`discounts[]`** not legacy `coupon`; **shared coupon ids** `churnshield_ret_{pct}p_3m`; **merchant-branded** coupon names; strips prior **ChurnShield** discounts before adding a new one; never `forever` coupons (repeating 3 months).
- **Embed `cs.js`**  Cancel intercept, chat UI (bubbles, typing, markdown), **`detectOffer`** → `offerType` + `discountPct`, **Keep** fires real outcome, **cancel / ×** re-fires merchant’s original cancel click.
- **`test-overlay.html`**  Local QA; **`USE_REAL_APIS`**; load **`cs.js` with `defer`** so `data-key` applies before init.
- **Clerk**  Auth, webhooks, tenant + email sync; **root layout** auth via **`ClerkAuthHeader`** to avoid hydration mismatch with `UserButton`.
- **Settings bugfix**  Removed duplicate hidden+checkbox `name` so checkboxes persist **allowPause** / extension / downgrade correctly in the DB.

### Cancel AI (`cancel-agent.ts` + `cancel-chat`)
- System prompt built from **merchant Settings** (explicit allowlist of what is enabled/disabled).
- **One concrete incentive type per assistant message** (no bundled “pause + discount” in one package); matches single `offerType` in the pipeline.
- Instruction: do **not** claim Stripe/billing is updated until **Keep my subscription**.

### Python agents (`apps/agents`)
- FastAPI app, **cron** jobs (churn scoring, feedback digest, payment retries, billing sweep, summaries, etc.).
- **Stripe event processing** including **`invoice.paid` → `handle_invoice_paid`** (confirms deferred saves; **no** Connect charge in worker).
- Churn prediction, outreach, payment recovery, feedback LangGraph pipeline, merchant emails, **`billing.py` 30-day** verification for pause/empathy-style rows.

### Documentation & ops notes
- **`PROJECT_STATUS.md`**  Living map: stack, schema, charge model, env vars, deploy checklist, key files, **feature roadmap table** (done vs not done), competitor snapshot, **“For future sessions”** delta log, and this summary.

### Not done yet (typical next steps)
- **Production deploy**  Vercel (web) + Railway (agents), production **Stripe webhook** to agents, env parity (include **`VOYAGE_API_KEY`** on Vercel if using semantic retrieval).
- **Hybrid offers**  e.g. pause then discount on resume (needs new product/API design).
- **Post-MVP**  i18n, **A/B / offer analytics dashboard**, ML churn model, automated tests, webhooks/Zapier, **Slack alerts (done)**, CSV export, optional coupon cleanup. *(Semantic feedback search: **done**  see roadmap table.)*



















Landing Page
#	Component	What it does
1	Navbar	Dark glass, sticky, logo + nav links + CTA button, mobile hamburger
2	Hero Section	Dark bg, large headline with colored word, badge pill, 2 CTA buttons, trust line
3	Chat Preview Card	Dark floating card  AI conversation mockup used in hero
4	Metrics Strip	4 stat columns with big number, label, sub-label, vertical dividers
5	Feature Capability Cards	Grid of icon + title + subtitle cards, clickable links
6	Company Name Pills	"Trusted by" social proof  horizontal pill tags
7	Product Pillar Section	Two-col layout: long text left + single stat card right, alternating bg
8	How It Works Cards	Numbered (01/02/03) step cards with icon, title, description
9	Feature Grid Cards	6-up grid  icon, title, description, hover lift effect
10	Pricing Card	Single card: big % number, feature checklist, CTA button, example calc box
11	Testimonials Columns	3 auto-scrolling columns, each card has stars + quote + initial avatar
12	FAQ Accordion	Expandable question/answer rows with +/× toggle
13	Footer CTA Banner	Dark gradient section, big headline, white CTA button
14	Footer	Dark bg, brand column, 3 link columns, copyright bar
Dashboard Shell (all pages share this)
#	Component	What it does
15	Sidebar	Collapsible left nav  logo, icon+label nav items, active highlight, collapse toggle
16	Sidebar Nav Item	Single link row: icon, label, optional badge, active/hover states
17	Page Header	Page title + subtitle, used at top of every internal page
Overview (main dashboard)
#	Component	What it does
18	KPI Stat Card	Label + big number + sub-label, optional accent color
19	Setup Banner	Dark "not connected yet" callout with CTA link  dismissible
20	Line Chart Card	Dark card wrapper with colored bar + title, contains recharts line/area chart
21	Bar Chart Card	Same dark card wrapper for bar/risk charts
Subscribers Page
#	Component	What it does
22	Data Table	Sortable table: subscriber ID, email, risk score, risk class, cancel attempts
23	Risk Badge	Pill badge: "high" red / "medium" amber / "low" green
24	Table Search Bar	Text input that filters table rows client-side
25	Export Button	Downloads CSV of current table data
26	Empty State	Centered illustration/icon + message when table has no rows
Sessions Page
#	Component	What it does
27	Sessions Table	Session ID, subscriber email, MRR, offer type, outcome, date
28	Outcome Badge	"Saved" green pill / "Cancelled" red pill
29	Offer Type Badge	Colored pill: discount/pause/extension/downgrade/empathy
30	Table Filter Row	Search + outcome filter dropdown
Offer Analytics Page
#	Component	What it does
31	Period Selector	Dropdown/tab: 7d / 30d / 90d / all-time
32	Summary KPI Row	4 cards: total attempts, saves, save rate, best offer
33	Grouped Bar Chart	Offer type on X axis, attempts vs saves bars
AI Analyst (Feedback) Page
#	Component	What it does
34	Chat Message Bubble	AI bubble (left) and user bubble (right) with different styles
35	Chat Input	Textarea + send button, Enter to submit
36	Chat Thread Container	Scrollable container with auto-scroll to bottom
Integration Page
#	Component	What it does
37	Step Card	Numbered step with title, description, optional code block
38	Code Block	Monospaced snippet with copy-to-clipboard button
39	Status Indicator	"Connected" / "Not connected" badge with green/gray dot
Settings Page
#	Component	What it does
40	Settings Section	Titled group of form controls with description
41	Toggle Switch	On/off for allow-pause, allow-extension, allow-downgrade
42	Select Dropdown	Styled <select> for discount % and duration options
43	Textarea Input	Custom message field with char count
44	Save Button	Primary action, shows loading/success state
45	Danger Zone Card	Red-bordered section for destructive actions