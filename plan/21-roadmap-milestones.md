# 21 — Roadmap & Milestones

Status: DRAFT
Related: `00-vision-and-scope.md`, `02-architecture.md`

Delivery is **vertically sliced**: each phase ends with something usable
end-to-end, not a pile of half-built services. Build as a modular monolith
(`ADR-0003`); extract services only when a trigger fires.

Timeboxes are relative (P0 = start). Treat as sequencing, not commitments.

---

## Phase 0 — Foundations (P0 → ~P0+3w)

**Goal:** a deployable skeleton with the rails everything else rides on.

- Monorepo (pnpm + Turbo), shared packages scaffolded (`config`, `ui`,
  `contracts`, `auth`, `events`, `observability`, `db`).
- CI/CD: lint/typecheck/test/build, image build+scan, preview envs, deploy to
  staging. Terraform for base infra (cluster, Postgres, Redis, object storage,
  broker, search).
- Observability baseline: OTel wiring, logger, `/healthz`/`/readyz`, one Grafana
  dashboard, Sentry.
- `api` app boots with module structure + per-context Postgres schemas +
  migration/seed pipeline + outbox scaffold.
- Next.js `storefront` app shell with design system, theming, i18n wrapper,
  error/not-found boundaries.
- **Identity & Access**: signup/login/verify, JWT + refresh rotation + reuse
  detection, RBAC `authorize()` + guard, permission seed, audit-event pipeline,
  staff invite flow, TOTP for staff.

**Exit:** a user can register/log in; staff can log into a stub admin; every
merge auto-deploys to staging with traces and dashboards.

---

## Phase 1 — Catalog & Discovery (~P0+3w → P0+8w)

**Goal:** browsable, searchable, SEO-clean storefront (read-only commerce).

- **Catalog**: categories (tree), brands, attributes, products, variants, media
  (signed S3 upload + image pipeline), admin catalog CRUD + moderation queue.
- **Inventory & Offers**: offer + stock model (no reservations yet), buy-box v1.
- **Search**: indexer pipeline + engine (Meili/OpenSearch), facets, autocomplete,
  category browse, zero-result handling.
- **Storefront pages**: home (ISR + CMS blocks), category (ISR), PDP (ISR +
  `generateMetadata` + JSON-LD), seller storefront, search (SSR).
- **SEO infra**: sitemaps, `robots.txt`, canonical rules, structured data,
  Lighthouse-CI gate.
- **Caching**: CDN + Redis read models + event-driven invalidation.
- **Admin**: catalog governance, category/brand/attribute management, CMS for
  home/landing pages.
- **Seller (minimal)**: register shop, create/edit offers, manage stock,
  bulk CSV import.

**Exit:** anonymous users browse/search a real catalog; sellers list products;
pages pass CWV + SEO checks; nothing is purchasable yet.

---

## Phase 2 — Transactional MVP (~P0+8w → P0+16w)  ← **public launch candidate**

**Goal:** end-to-end buying with real money, single currency/locale/region.

- **Cart**: guest (Redis) + user cart, merge on login, live re-pricing.
- **Pricing & Promotions**: coupons (platform + seller), validation, stacking
  rules, redemption limits (race-safe).
- **Stock reservations**: TTL holds, atomic decrement (no oversell), sweeper.
- **Checkout + place-order saga**: multi-seller → order + sub-orders, snapshots,
  address serviceability, shipping options (flat/table rates first), tax
  (single-jurisdiction), idempotent confirm, full compensation paths.
- **Payments & Ledger**: one marketplace-capable provider, authorize/capture
  (capture-on-ship or capture-now per `12` §7 decision), double-entry ledger,
  escrow, refunds, webhooks + reconciliation job.
- **Order lifecycle**: seller confirm/pack/ship + tracking entry, buyer tracking
  page, cancel (pre-ship) + refund saga, invoices (PDF).
- **Payouts**: seller balance from ledger, scheduled payout run, statements,
  holds.
- **Seller KYC**: document upload + admin review/approve, bank account
  verification, agreement acceptance, go-live gating.
- **Notifications**: service + in-app inbox + email for the order/seller/auth
  catalog; preferences.
- **Realtime**: gateway for order status + seller new-order + notification badge.
- **Reviews**: post-delivery product review (verified purchase), seller rating,
  basic moderation.
- **Trust & Safety (minimal)**: report flow, review moderation queue, manual
  refunds within cap, enforcement actions (hide/suspend).
- **Admin**: buyer/seller management, order view/force-cancel/refund, seller
  approval, platform coupons.
- **Hardening**: rate limits, WAF, security headers, CSP, pen-test round 1, load
  test, DR drill, runbooks.

**Exit / launch gate:** all Phase-2 E2E journeys green (`19` §2), load test at
Phase-1 scale targets passes, ledger reconciliation clean, security sign-off,
rollback tested, on-call ready.

---

## Phase 3 — Marketplace depth (~P0+16w → P0+28w)

**Goal:** make it competitive and operable at scale.

- **Returns/RMA** full flow (labels, inspection, replace/partial refund), disputes
  case management, chargeback handling, seller-fault fee.
- **Messaging**: buyer↔seller threads (pre-sale + order), attachments, real-time,
  staff escalation + mediation, content filters.
- **Service Admin console**: full queues (reports, moderation, disputes, tickets),
  SLA timers, canned responses, macros, impersonation (read-only).
- **Shipping**: carrier API integration (label purchase, live tracking webhooks),
  zone/rate management, multi-warehouse, partial shipments.
- **Seller analytics**: sales/traffic/conversion dashboards, quality metrics,
  health score + enforcement ladder, aging inventory, scheduled digests.
- **Promotions v2**: platform campaigns with funding split, flash sales,
  merchandising slots, featured placement, budget tracking.
- **Recommendations v1**: "bought together", "popular in category", recently
  viewed, back-in-stock / price-drop alerts.
- **Wishlist / follow sellers / Q&A on PDP.**
- **Super Admin**: custom staff roles UI, global financial config, feature flag
  console, four-eyes approvals, break-glass, full audit search.
- **Reserves & risk**: rolling reserves for new sellers, fraud rules engine,
  velocity checks, manual review queue.
- **First service extractions** as triggers fire (Search, Realtime, Notifications
  already separate; consider Payments, Media).

**Exit:** platform can be operated by a support/ops team without engineering
intervention for daily work.

---

## Phase 4 — Scale & expansion (P0+28w →)

- Multi-currency, multi-locale storefront (i18n hooks already in place).
- Additional regions / payment methods / tax jurisdictions (marketplace
  facilitator handling).
- Advanced personalization / ML ranking, sponsored listings (labeled).
- Seller API + webhooks for external integrations, app ecosystem.
- Analytics warehouse (ClickHouse/BigQuery) + self-serve dashboards.
- Read/write DB split per context where load demands; table partitioning.
- Possible: platform logistics, subscriptions, digital goods — each its own
  scoped project.

---

## Cross-cutting, every phase (definition of done)

- Tests at the right layers + coverage floors (`19`).
- Dashboards, SLOs, alerts, runbook for anything new.
- Back-office visibility/moderation for any user-facing feature.
- Audit events for privileged mutations.
- SEO checks for any new indexable page.
- a11y (AA) + responsive (PC + mobile) for any new UI.
- ADR for any non-trivial or hard-to-reverse decision.
- `plan/` docs updated; changelog entries where relevant.

## MVP cut line (what "launch" needs vs. what can wait)

**Must:** auth+RBAC, catalog, search, cart, coupons, checkout saga, payments+
ledger+escrow, order lifecycle up to delivered, pre-ship cancel+refund, seller
KYC+offers+fulfilment, payouts, transactional notifications, basic reviews,
report+basic moderation, essential admin, security hardening, observability, DR.

**Can wait (Phase 3+):** returns/RMA automation, full dispute tooling, messaging,
carrier label integration, seller analytics depth, campaigns/merchandising,
recommendations, custom staff roles UI, multi-currency/locale, reserves/fraud
engine.
