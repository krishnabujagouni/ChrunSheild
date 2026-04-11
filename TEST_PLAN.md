# ChurnQ  Test Plan & Competitive Review
*Generated: April 4, 2026*

---

## 1. Endpoint Inventory

### Web (Next.js)  `apps/web/src/app/api/`

| Route | Method | Auth | What it does |
|-------|--------|------|-------------|
| `/api/public/cancel-intent` | POST | HMAC or grace mode | Creates `save_sessions` row, validates embed auth, returns merchant offer settings |
| `/api/public/cancel-chat` | POST | None (sessionId scoped) | Streams Claude Sonnet cancel conversation; writes transcript on finish |
| `/api/public/cancel-outcome` | POST | None (sessionId scoped) | Records save/cancel, applies Stripe coupon/pause/downgrade, supersedes stale saves |
| `/api/public/pause` | POST | None (sessionId scoped) | Pauses Stripe sub via `mark_uncollectible`, creates session row |
| `/api/public/subscriber-status` | GET | HMAC | Returns `paymentWallActive` + `pauseWallActive` flags |
| `/api/dashboard/embed-hmac` | GET | Clerk | Returns current embed signing status |
| `/api/dashboard/embed-hmac` | POST | Clerk | Rotates `embedHmacSecret`, sets `embedSecretActivated = true` |
| `/api/dashboard/metrics` | GET | Clerk | Aggregates sessions/outcomes/feedback for dashboard charts |
| `/api/feedback/search` | POST | Clerk | AI Analyst  hybrid pgvector + keyword digest retrieval, generates answer via Claude |
| `/api/stripe/connect/start` | GET | Clerk | Initiates Stripe Connect OAuth (HMAC-signed state) |
| `/api/stripe/connect/callback` | GET | HMAC state | Exchanges OAuth code, saves `stripeConnectId` |
| `/api/webhooks/clerk` | POST | Svix signature | Handles `user.created`, `user.updated`, `organization.created`  auto-provisions tenant |
| `/api/webhooks/stripe` | POST | Stripe-Signature | Ingests Stripe events (via agents proxy or direct) |

### Python Agents (FastAPI)  `apps/agents/`

| Route | Method | Auth | What it does |
|-------|--------|------|-------------|
| `GET /health` | GET | None | Checks DB, Stripe, email, AI config |
| `POST /agents/churn-prediction` | POST | Internal | Runs heuristic scoring on all subscribers; triggers outreach + high-risk email |
| `POST /agents/feedback-digest` | POST | Internal | Runs LangGraph 6-node pipeline; emails merchant weekly digest |
| `POST /agents/billing-sweep` | POST | Internal | Manual trigger for 30-day billing sweep |
| `GET /agents/churn-predictions/{tenant_id}` | GET | Internal | Returns predictions, optional `risk_class` filter |
| `GET /agents/feedback-digests/{tenant_id}` | GET | Internal | Returns digests with transcript counts |
| `POST /webhooks/stripe` | POST | Stripe-Signature | Verifies + stores Stripe events; dispatches `stripe_worker` background task |

---

## 2. Feature Areas  How They Work

### A. Cancel Flow (Core product)
```
Subscriber clicks Cancel
  → cs.js intercepts (capture-phase click handler)
  → POST /cancel-intent (HMAC auth, creates save_session)
  → Chat overlay opens, seeds first user message
  → POST /cancel-chat (streams Claude Sonnet)
      system prompt = merchant brand + offer allowlist + MRR tier cap
      injection filter on user messages
      onFinish writes transcript JSON to DB
  → Subscriber clicks "Keep" or "I still want to cancel"
  → POST /cancel-outcome
      saved → apply Stripe offer (coupon / pause / credit)
      cancelled → re-fire original cancel click (_bypassNext)
```

### B. Billing / Fee Collection
```
Empathy / Pause → outcomeConfirmedAt = now
  → billing sweep (04:00 UTC) checks after 30 days
  → subscription still active → Stripe Connect charge (15% of MRR)

Extension / Discount / Downgrade → outcomeConfirmedAt = null
  → stripe_worker.handle_invoice_paid()
  → matches newest eligible save_session per tenant+customer
  → stamps confirmation + charges Connect immediately from invoice amount_paid

Supersede rule: new `saved` outcome voids older unbilled saves for same subscriber
```

### C. Embed Auth (HMAC)
```
Tenant provisioned → embedAppId (cs_app_...) + embedHmacSecret auto-generated
Grace mode (embedSecretActivated = false):
  - unsigned requests allowed through with X-ChurnQ-Warning header
  - wrong hash always rejected
Activated (after first rotate):
  - missing hash → 401 auth_hash_required
  - wrong hash → 401
Merchant signs: HMAC-SHA256(secret, subscriberId) hex from their server
```

### D. Stripe Connect
```
/stripe/connect/start → HMAC-signed state param → redirect to Stripe OAuth
/stripe/connect/callback → verify state → oauth.token → save stripeConnectId
Coupons created per Connect account + shape: ChurnQ_ret_{pct}p_{3}m
No stacking: drop existing ChurnQ discounts before attaching new one
```

### E. Churn Prediction (Python)
```
Daily 02:00 UTC:
  score = 0.40 × (failed_payments/3) + 0.35 × (cancel_attempts/2) + 0.25 × (days_inactive/90)
  HIGH ≥ 0.60 | MED ≥ 0.30 | LOW < 0.30
  → upsert churn_predictions
  → HIGH risk → proactive outreach email to subscriber
  → any HIGH found → high-risk alert email to merchant
```

### F. Feedback Analyser (Python LangGraph)
```
Mon 03:00 UTC  6-node pipeline:
  fetch → extract → cluster (TF-IDF + KMeans) → summarize (Claude Haiku) → compose → store
  → embed digest with Voyage voyage-3-lite (input_type: document)
  → email merchant weekly digest
Web AI Analyst:
  query → Voyage embed (input_type: query) → pgvector cosine NN → keyword fill → Claude generateText answer
```

---

## 3. Test Coverage  Current State

### VERDICT: Zero application tests exist

- No `.test.ts` / `.spec.ts` files in `apps/web/src/`
- No `test_*.py` / `*_test.py` files in `apps/agents/src/`
- `apps/agents/tests/__init__.py` exists but is empty
- No jest / vitest config in `apps/web/package.json`
- No pytest config in `apps/agents/pyproject.toml`
- No Playwright setup anywhere

---

## 4. Missing Tests  Full List

### Priority 1: Security & Auth (test these before deploy)

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| S1 | `verifyEmbedAuthHash()`  valid hash passes | `lib/embed-auth.ts` | Core security boundary |
| S2 | `verifyEmbedAuthHash()`  wrong hash rejected | `lib/embed-auth.ts` | Prevents unauthorized cancel intents |
| S3 | `verifyEmbedAuthHash()`  timing-safe (no timing oracle) | `lib/embed-auth.ts` | Security property |
| S4 | cancel-intent: grace mode allows unsigned, sets warning header | `/api/public/cancel-intent` | Grace mode logic |
| S5 | cancel-intent: grace mode rejects wrong hash even when not activated | `/api/public/cancel-intent` | Wrong hash always fails |
| S6 | cancel-intent: activated mode rejects missing hash with 401 | `/api/public/cancel-intent` | Auth enforcement |
| S7 | Stripe Connect state HMAC verify  tampered state rejected | `/api/stripe/connect/callback` | OAuth security |
| S8 | Clerk webhook Svix signature rejection on bad sig | `/api/webhooks/clerk` | Webhook security |
| S9 | Input bounds: MRR > 10000 capped/rejected | cancel-intent, cancel-outcome | Input validation |
| S10 | Input bounds: subscriberId > 255 chars rejected | cancel-intent | Input validation |
| S11 | Injection filter: jailbreak attempts blocked in cancel-chat | `/api/public/cancel-chat` | Prompt injection |

### Priority 2: Core Cancel Flow Logic

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| C1 | cancel-intent creates save_session row | `/api/public/cancel-intent` | Core flow |
| C2 | cancel-intent returns correct offer settings from tenant config | `/api/public/cancel-intent` | Merchant config respected |
| C3 | cancel-outcome `saved` → records offerType + savedValue | `/api/public/cancel-outcome` | Fee basis correct |
| C4 | cancel-outcome `cancelled` → no Stripe charges | `/api/public/cancel-outcome` | No false charges |
| C5 | cancel-outcome supersedes prior unbilled save for same subscriber | `/api/public/cancel-outcome` | Double-charge guard |
| C6 | cancel-outcome discount → creates Stripe coupon with correct id | `/api/public/cancel-outcome` | Stripe integration |
| C7 | cancel-outcome discount → drops existing ChurnQ coupon before attaching | `/api/public/cancel-outcome` | No stacking |
| C8 | cancel-outcome coupon id format: `ChurnQ_ret_{pct}p_{3}m` | `/api/public/cancel-outcome` | Idempotency key |
| C9 | cancel-outcome extension → applies Stripe credit balance | `/api/public/cancel-outcome` | Stripe integration |
| C10 | cancel-chat: messages > 32 rejected | `/api/public/cancel-chat` | Abuse guard |
| C11 | cancel-chat: message content > 12KB rejected | `/api/public/cancel-chat` | Abuse guard |
| C12 | cancel-chat: last message must be user role | `/api/public/cancel-chat` | Protocol |
| C13 | detectOffer() parses discount pct from assistant message | `cs.js` | Offer type detection |
| C14 | detectOffer() parses pause offer | `cs.js` | Offer type detection |
| C15 | _bypassNext prevents re-interception on re-fire | `cs.js` | Cancel re-fire logic |

### Priority 3: Billing & Stripe Fee Logic

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| B1 | stripe_worker.handle_invoice_paid picks newest eligible session | `stripe_worker.py` | Correct session matched |
| B2 | stripe_worker skips `offer_accepted = false` rows (voided) | `stripe_worker.py` | Supersede rule respected |
| B3 | stripe_worker stamps outcomeConfirmedAt + feeCharged from invoice amount | `stripe_worker.py` | Fee calculation |
| B4 | billing_sweep only charges sessions ≥ 30 days old | `billing.py` | Timing guard |
| B5 | billing_sweep skips already billed sessions (feeBilledAt set) | `billing.py` | Idempotency |
| B6 | billing_sweep skips cancelled subscriptions | `billing.py` | No charge if churned |
| B7 | Fee = 15% of savedValue (post-discount MRR) | `billing.py` | Correct fee math |
| B8 | payment_recovery maps Stripe error codes → failure_class correctly | `payment_recovery.py` | Retry routing |
| B9 | payment retry sweep claims due rows, calls Invoice.pay() | `queue.py` | Retry logic |
| B10 | payment wall activates after max retry attempts exhausted | `queue.py` | Wall trigger |

### Priority 4: Churn Prediction

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| P1 | Score formula: 0.40×failed + 0.35×cancels + 0.25×inactive | `churn_prediction.py` | Correct weights |
| P2 | HIGH ≥ 0.60, MED ≥ 0.30, LOW < 0.30 thresholds | `churn_prediction.py` | Classification |
| P3 | score clamped to [0, 1] | `churn_prediction.py` | No overflow |
| P4 | No duplicate upsert  same subscriber overwrites old prediction | `churn_prediction.py` | DB hygiene |
| P5 | High-risk alert email triggered only when HIGH risk exists | `churn_prediction.py` | Email accuracy |

### Priority 5: Embed Provisioning & Tenant

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| T1 | Clerk user.created → tenant auto-provisioned with snippetKey | `/api/webhooks/clerk` | Onboarding |
| T2 | snippetKey uniqueness: cs_live_ prefix, 32 chars | `lib/tenant-embed.ts` | Format |
| T3 | embedAppId uniqueness: cs_app_ prefix, 32 chars | `lib/tenant-embed.ts` | Format |
| T4 | embed-hmac POST rotates secret and sets embedSecretActivated = true | `/api/dashboard/embed-hmac` | Grace mode exit |
| T5 | findTenantByPublicEmbedId resolves both embedAppId and snippetKey | `lib/tenant-by-embed.ts` | Dual lookup |
| T6 | Clerk user.updated syncs ownerEmail | `/api/webhooks/clerk` | Email sync |

### Priority 6: Rate Limiting

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| R1 | cancel-intent: > N requests within window → 429 | `lib/rate-limit.ts` | Abuse protection |
| R2 | rate limiter fails open (returns allowed) when Upstash unavailable | `lib/rate-limit.ts` | Dev/outage safety |
| R3 | Each endpoint has its own rate limit key | All public endpoints | Isolation |

### Priority 7: AI Analyst & Feedback

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| A1 | feedback/search returns answer + traceId | `/api/feedback/search` | Response contract |
| A2 | feedback/search falls back to keyword-only when VOYAGE_API_KEY missing | `lib/feedback-digest-retrieval.ts` | Graceful degradation |
| A3 | feedback/search falls back to keyword-only on vector query failure | `lib/feedback-digest-retrieval.ts` | Graceful degradation |
| A4 | Digest retrieval: keyword fill pads to 3 digests | `lib/feedback-digest-retrieval.ts` | Min context for AI |

### Priority 8: Dashboard & Metrics

| # | What to test | File | Why critical |
|---|-------------|------|-------------|
| D1 | metrics endpoint returns correct save rate calculation | `/api/dashboard/metrics` | KPI accuracy |
| D2 | sessions table filters by outcome correctly | `sessions-table.tsx` | UI correctness |
| D3 | sessions table filters by date range (local day bounds) | `sessions-table.tsx` | Date logic |
| D4 | sessions table search matches email and subscriberId | `sessions-table.tsx` | Search logic |
| D5 | summary pills reflect filtered set, not total | `sessions-table.tsx` | Filter-aware UI |

### Priority 9: E2E / Integration

| # | What to test | Type | Scenario |
|---|-------------|------|---------|
| E1 | Full cancel flow: identify → cancel-intent → chat → saved | Playwright | Happy path |
| E2 | Full cancel flow: identify → cancel-intent → chat → cancelled | Playwright | Cancel path |
| E3 | Pause wall: identify → pauseWall() → pause accepted | Playwright | Pause flow |
| E4 | Payment wall: isPaymentWallActive() returns true when flag set | Playwright | Wall check |
| E5 | Embed grace mode banner visible on settings before rotate | Playwright | UX state |
| E6 | Embed secure badge flips to green after rotate | Playwright | UX state |

---

## 5. Churnkey Competitive Comparison

### ChurnQ vs Churnkey  Feature Matrix

| Feature | Churnkey | ChurnQ | Gap / Advantage |
|---------|----------|-------------|----------------|
| **Pricing** | $299–$599/mo flat | 15% of retained MRR | ✅ CS wins for indie/SMB. No upfront risk |
| **Setup** | Demo required | Self-serve | ✅ CS wins  lower friction |
| **Cancel interception** | Static modal / offer flow | Live AI streaming chat | ✅ CS wins  conversational, adaptive |
| **Offer types** | Discount, pause, downgrade | Discount, pause, extension, downgrade, empathy | ✅ CS parity + extension |
| **Hybrid offers** (pause → discount) | Yes ("playbooks") | ❌ Not built | ❌ Churnkey wins |
| **Proactive churn prediction** | ❌ No | ✅ Daily heuristic scoring + outreach email | ✅ CS wins |
| **AI feedback analyst** | ❌ No | ✅ pgvector + keyword hybrid + Claude | ✅ CS wins |
| **Weekly digest email** | ❌ No | ✅ LangGraph pipeline | ✅ CS wins |
| **High-risk alert emails** | ❌ No | ✅ Daily after scoring | ✅ CS wins |
| **Offer performance analytics** | ✅ Yes | ❌ Not built (data exists, UI missing) | ❌ Churnkey wins |
| **A/B testing offers** | ✅ Yes | ❌ Not built | ❌ Churnkey wins |
| **Webhooks / Zapier** | ✅ Yes | ❌ Not built | ❌ Churnkey wins |
| **Slack / Discord alerts** | ✅ Yes | ❌ Not built | ❌ Churnkey wins |
| **CSV export** | ✅ Yes | ❌ Not built | ❌ Churnkey wins |
| **Multi-language** | ✅ Yes | ❌ Not built (Post-MVP) | ❌ Churnkey wins |
| **Payment recovery** | Partial | ✅ Full retry sweep + failure classification | ✅ CS wins |
| **Pause wall (proactive)** | ❌ | ✅ Built (advanced, not surfaced) | ✅ CS wins |
| **Payment wall** | ❌ | ✅ Built + `subscriber_flags` | ✅ CS wins |
| **Embed signing (HMAC)** | Unknown | ✅ Full HMAC + grace mode | ✅ CS wins |
| **Test coverage** | Unknown | ❌ Zero | Risk |
| **SOC2 / compliance** | ✅ Yes | ❌ Not built | ❌ Churnkey wins for enterprise |
| **Multi-seat / teams** | ✅ Yes | ❌ Single owner per tenant | ❌ Churnkey wins |
| **Trained ML model** | Unknown | ❌ Heuristic only | ❌ Gap |
| **Stripe Connect** | Yes | ✅ Full OAuth + Connect | ✅ CS parity |

### Key Takeaways

**Where ChurnQ wins (ICP: indie hackers, solo SaaS founders)**
1. Performance pricing  no flat fee risk; aligns incentives
2. AI conversation vs static modals  higher save rate potential
3. Proactive churn prediction with outreach  Churnkey is reactive
4. AI feedback analyst ("ask your retention data")  unique feature
5. Passive email intelligence (digests, high-risk alerts)  value without logging in
6. Payment recovery pipeline  more sophisticated than typical

**Where Churnkey wins (ICP: mid-market, teams)**
1. Playbooks / hybrid offers  sequenced retention flows
2. Offer A/B testing + analytics dashboard
3. Webhooks, Zapier, Slack/Discord integrations
4. CSV export, audit logs
5. Multi-language support
6. SOC2, enterprise procurement
7. Multi-seat dashboards

**Gaps to close for ChurnQ to move upmarket:**
1. Offer analytics dashboard (data already in `save_sessions.offerType`)
2. Webhooks ("save created", "high risk detected")
3. CSV export (sessions + subscribers)
4. Hybrid offers (pause → discount)
5. Test coverage (credibility + stability)

---

## 6. Recommended Test Implementation Order

```
Phase 1  Before deploy (security + core flow)
  S1–S11  Security & auth tests
  C1–C15  Cancel flow unit tests
  B1–B7   Billing logic unit tests

Phase 2  Stability (within first week post-deploy)
  P1–P5   Churn prediction tests
  T1–T6   Tenant provisioning tests
  R1–R3   Rate limiting tests

Phase 3  Confidence (after first real merchant)
  A1–A4   AI Analyst tests
  D1–D5   Dashboard / metrics tests
  E1–E6   Playwright E2E tests

Phase 4  CI pipeline
  jest/vitest setup in apps/web
  pytest setup in apps/agents
  GitHub Actions: run tests on PR + deploy
```

---

## 7. Suggested Test Stack

| Layer | Tool | Config file |
|-------|------|------------|
| Web unit/integration | Vitest + @testing-library/react | `apps/web/vitest.config.ts` |
| Web API route tests | Vitest + MSW (mock Stripe/Clerk) | `apps/web/src/app/api/**/*.test.ts` |
| Python agents | pytest + pytest-asyncio | `apps/agents/tests/` |
| Python Stripe mocks | `stripe-mock` or `unittest.mock` | per test file |
| E2E | Playwright | `apps/web/tests/e2e/` |
| AI eval | Claude-graded (custom harness) | `apps/web/tests/evals/` |
