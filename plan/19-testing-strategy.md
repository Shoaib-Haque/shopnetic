# 19 — Testing Strategy

Status: DRAFT
Related: `09-frontend-architecture.md`, `12-cart-checkout-orders.md`, `17-infrastructure-devops.md`

## Philosophy

Test behavior at the cheapest layer that gives confidence. Heavy on fast unit +
contract tests, a focused band of integration tests, a thin layer of E2E on
money/trust journeys. Every bug fixed gets a regression test.

## 1. Test pyramid

| Layer | Tooling | Scope | Runs |
|-------|---------|-------|------|
| **Static** | TypeScript strict, ESLint, `tsc --noEmit`, Zod schema checks | Types, lint rules, dead code | pre-commit + PR |
| **Unit** | Vitest | Pure logic: pricing, discount allocation, tax, ledger balancing, state machines, RBAC `authorize()`, validators | PR (fast, parallel) |
| **Component (FE)** | Vitest + React Testing Library | Components with logic/state; a11y via `axe` | PR |
| **Contract** | OpenAPI schema tests / Pact | FE↔BFF, BFF↔service, producer/consumer event payloads | PR |
| **Integration** | Vitest + Testcontainers (real Postgres/Redis/RabbitMQ/Meili) | A module against real infra: repo queries, migrations, outbox, consumers, saga steps | PR (tagged) + merge |
| **E2E** | Playwright | Critical cross-system journeys in a real deployed preview env | preview on PR (smoke) + full on merge |
| **Load / stress** | k6 / Artillery | Throughput, latency, autoscaling, DB limits | nightly / pre-release |
| **Security** | Semgrep/CodeQL, gitleaks, ZAP baseline, dependency/container scan | SAST, secrets, DAST baseline, CVEs | PR + nightly |
| **Chaos / resilience** | Toxiproxy, pod kill, injected saga failures | Compensation, retries, circuit breakers, graceful degradation | staging, scheduled |
| **Visual regression** | Playwright screenshots / Chromatic | `packages/ui` + key pages | PR |
| **Manual / exploratory** | scripts + checklist | New flows, moderation UX, edge cases | per release |

## 2. Critical E2E journeys (keep this list small and green)

1. Browse → search → PDP → add multi-seller cart → checkout → pay (test gateway)
   → order + sub-orders created, stock decremented, ledger balanced, emails queued.
2. Payment declined → cart intact, stock released, clear retry.
3. Seller: create offer → receives sub-order → confirm → ship (tracking) →
   buyer sees status → delivered → escrow release timer set.
4. Buyer cancel pre-ship → refund saga → ledger reversed, stock restored, buyer
   notified.
5. Return request → approve → RMA → receive → refund → seller metrics updated.
6. Coupon: valid apply, invalid reasons shown, over-limit blocked, revalidated at
   confirm.
7. Admin: approve seller application (KYC) → seller can go live.
8. Service Admin: resolve a report; moderate a review; mediate an escalated thread.
9. Dispute: open → evidence → resolution → refund within cap / escalation above cap.
10. Payout run: available balance → payout → statement; failure → reversal → retry.
11. Auth: signup → verify → login → refresh rotation → reuse detection revokes family.
12. RBAC: seller cannot touch another seller's offer/order (403/404); demoted staff
    blocked mid-session.

## 3. Correctness-critical property/edge tests

- **Ledger**: every journal sums to zero; account balance == Σ entries; no
  orphan entries (property-based).
- **No oversell**: N concurrent buyers, 1 unit left → exactly one succeeds
  (integration, real DB, parallel).
- **Coupon limits**: concurrent redemptions never exceed `usage_limit` /
  `per_user_limit`.
- **Idempotency**: duplicate `place order` / webhook / refund → single effect.
- **Saga compensation**: inject failure at each step → system returns to a
  consistent state (money, stock, order all reconciled).
- **Totals**: order total == Σ sub-order totals == Σ line math + shipping, across
  partial cancel/return/refund and split payment.
- **Out-of-order webhooks**: `captured` before `confirm` response, `refund`
  before `capture` ack → state machine stays valid.
- **Snapshot immutability**: editing a product after purchase doesn't change the
  historical order line.

## 4. Test data & environments

- **Deterministic seed** shared with local/preview: fixed ids for categories,
  demo sellers/buyers/staff, a catalog of ~a few hundred products with variants,
  coupons, feature flags.
- **Factories** (per entity) for building state in tests; no shared mutable
  fixtures across tests.
- **Testcontainers** for integration — real engines, ephemeral, parallel-safe
  (schema-per-worker or DB-per-worker).
- **Fake providers**: test doubles for payment (programmable outcomes: success,
  decline, 3DS, timeout, webhook replay), shipping (tracking events on demand),
  email (Mailpit), search (real Meili container).
- **No prod data** in tests. Anonymized prod-shaped dataset only on staging for
  load/migration rehearsal.
- Time control: injectable clock for TTLs, escrow windows, payout schedules,
  coupon expiry.

## 5. Frontend testing specifics

- Component tests assert behavior + accessibility, not snapshots of markup.
- MSW to mock the typed API client at the network boundary.
- Playwright: mobile + desktop viewports; iOS Safari + Android Chrome in CI;
  test loading/empty/error states explicitly.
- Lighthouse-CI budget gate (`09` §7) + `axe` on key pages; block merge on
  regression.
- Contract: generated client types checked against current OpenAPI in CI.

## 6. Non-functional test gates

| Gate | Threshold (fail build) |
|------|------------------------|
| Unit+component coverage | ≥ 80% lines on `packages/*` and service domain logic; 100% on ledger/pricing/discount/saga modules |
| Mutation testing (Stryker) on money modules | ≥ 70% killed |
| Contract tests | all pass, no undocumented breaking API diff |
| Lighthouse (storefront key pages) | LCP/INP/CLS within budget |
| a11y (axe) | zero serious/critical |
| Load test (pre-release) | p95 within SLO at target RPS, no error-rate rise, autoscaling stabilizes |
| Security scans | no High/Critical without a signed waiver |
| Migration rehearsal | lock time < agreed window on prod-sized data |

Coverage is a floor, not a goal — review still checks that tests assert
meaningful behavior.

## 7. Load & performance testing

- Model realistic mix: 80% browse/search, 15% cart, 4% checkout start, 1%
  confirm; plus seller + admin background load.
- Scenarios: steady peak, flash-sale spike (10× in 2 min on a few SKUs — tests
  stock contention + cache stampede), Black-Friday soak (hours).
- Assert: SLOs hold, no oversell under contention, DB connections/queue depth
  bounded, autoscaling reacts, cost acceptable.
- Run against staging with prod-like data + infra sizing.

## 8. CI wiring (see `17` §7)

Affected-only via Turbo; unit/component/contract on every push; integration
tagged and on PR + merge; E2E smoke on preview, full on merge; nightly = full
E2E + load + security + chaos. Flaky tests quarantined with an owner + deadline,
not left to rot.

## 9. Release testing

Pre-release checklist: full E2E green, load test passed, migration rehearsed,
rollback tested, feature flags configured, dashboards/alerts in place, runbook
updated, security scan clean. Canary in prod with automated SLO-based rollback.

## 10. Ownership

Each bounded context owns its unit/integration/contract tests. A small shared
suite owns cross-cutting E2E journeys. QA/dev-in-test focuses on exploratory +
journey design, not gatekeeping every PR.
