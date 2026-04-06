# ChurnShield (chrun)

Monorepo for **ChurnShield**: an AI-native subscription retention platform (cancel-flow agent, payment recovery, churn prediction, feedback analysis), per the product spec.

## Layout

| Path | Role |
|------|------|
| `apps/web` | **Next.js 14 (App Router)**  dashboard, marketing, API routes (Clerk, Stripe Connect UI, Vercel AI SDK for streaming cancel agent). `public/cs.js` is the embed snippet; `public/test-app/` is the manual cancel-flow test page. |
| `apps/agents` | **FastAPI on Railway**  Stripe webhooks, BullMQ/Redis jobs, LangGraph (prediction), CrewAI (feedback). |
| `packages/snippet` | Optional separate source for building `cs.js` if not only from `apps/web/public`. |
| `infra/env.example` | Environment variable names aligned with deployment (no secrets). |

## Product summary

- **Integrations:** Stripe Connect OAuth, one script tag + `ChurnShield.identify()`, webhooks for payment events.
- **Data:** PostgreSQL (Supabase) + Prisma in `apps/web/prisma` (schema to be added); optional pgvector for feedback embeddings.
- **Agents:** Cancel flow primarily on **Vercel** (streaming); payment recovery, prediction crons, and feedback jobs on **Python**.

## Quickstart

### Database (Supabase or local Postgres)

Set `DATABASE_URL` in `apps/web/.env` (and `apps/agents/.env` for the same URL). Apply schema:

```bash
cd apps/web
npx prisma migrate deploy
npx prisma db seed
```

Demo tenant uses snippet key `cs_test_demo` (see `prisma/seed.ts`). Cancel-intent API will 401 without a matching `tenants.snippet_key`.

### Python agents

From repo root:

```bash
uv sync
cd apps/agents
# copy infra/env.example → .env and set DATABASE_URL, STRIPE_WEBHOOK_SECRET
uv run churnshield-agents
```

- Health: `http://127.0.0.1:8000/health`
- Stripe webhooks: `POST http://127.0.0.1:8000/webhooks/stripe` (requires signature; events with Connect include `account` → mapped to `tenants.stripe_connect_id`). New rows are processed in a **background task**: `invoice.payment_failed` is classified in `payment_recovery` and the row is marked `processed`; other types are marked processed with no-op (extend in `workers/stripe_worker.py`).

### Web app

```bash
cd apps/web
npm install
npm run dev
```

- Manual cancel test: open `http://localhost:3000/test-app/index.html`, click **Cancel subscription** (after migrate + seed).
- Public API: `POST /api/public/cancel-intent` with JSON `{ "snippetKey", "subscriberId", "subscriptionMrr" }`.
- Streaming cancel agent: `POST /api/public/cancel-chat` with `{ "snippetKey", "sessionId", "messages" }` (last message must be `user`). Requires `ANTHROPIC_API_KEY` in `apps/web` env. The snippet (`public/cs.js`) opens an overlay and streams the assistant reply; each completed turn is written to `save_sessions.transcript`.

### Stripe Connect (Standard OAuth)

Set `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_CONNECT_REDIRECT_URI` (must match [Stripe Dashboard](https://dashboard.stripe.com/settings/connect/onboarding-options/oauth) redirect allowlist), and `CHURNSHIELD_ONBOARD_SECRET` (dev gate until Clerk). Optionally `NEXT_PUBLIC_APP_URL` for post-connect redirects.

1. `npx prisma db seed`  copy the logged **tenant id**.
2. Open (browser):  
   `/api/stripe/connect/start?tenantId=<uuid>&secret=<CHURNSHIELD_ONBOARD_SECRET>`  
   or same `tenantId` with header `x-churnshield-onboard-secret: <secret>`.
3. Finish Stripe OAuth; callback writes `tenants.stripe_connect_id` (`acct_...`). Webhooks from Connect use `event.account` to resolve the tenant in `apps/agents`.

## Documents

`ChurnShield_Product_Document.docx`  full product, stack, and week-by-week plan.
