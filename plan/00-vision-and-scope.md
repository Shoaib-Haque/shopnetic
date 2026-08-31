# 00 — Vision & Scope

Status: DRAFT

## 1. One-line vision

A multi-vendor online marketplace where independent sellers list products and
buyers discover, purchase, and track them — with a role-based back office for
platform staff to keep the marketplace safe and running.

## 2. Why this shape

Amazon-like means **marketplace**, not single-store. That single fact drives most
of the architecture:

- There are **many sellers**, so we need seller onboarding, per-seller catalogs,
  per-seller payouts, and per-seller performance metrics.
- A cart can contain items from **multiple sellers**, so one checkout produces
  **multiple sub-orders** (one shipment/settlement unit per seller).
- The platform holds money **in escrow** between "buyer paid" and "seller
  fulfilled", so we need a ledger, not just a payments integration.
- Trust & safety is a first-class product surface (reports, moderation, disputes),
  which is why "Service Admin" exists as its own role.

## 3. Primary actors

| Actor | Summary |
|-------|---------|
| Guest | Unauthenticated visitor. Can browse, search, build a local cart. |
| Buyer | Registered customer. Places orders, tracks them, reviews, messages sellers, opens disputes. |
| Seller | Owns a shop. Manages products, inventory, pricing, promotions, order fulfilment, payouts. |
| Service Admin | Trust & safety / support staff. Handles reports, reviews moderation, message escalations, disputes. No billing/config power. |
| Admin | Operations staff. Manages buyers, sellers, catalog policy, platform-wide promotions, coupons, categories. |
| Super Admin | Owns the platform. Manages Admins and their permissions, global config, feature flags, financial settings. |

Full permission matrix: `03-users-and-rbac.md`.

## 4. In scope (target end-state)

- Catalog: categories, brands, products, variants, attributes, media, inventory.
- Discovery: full-text + faceted search, category browse, recommendations (basic).
- Cart & checkout: multi-seller cart, addresses, shipping options, coupons,
  taxes, multiple payment methods.
- Orders: lifecycle, per-seller sub-orders, cancellation, returns/refunds,
  invoices, tracking.
- Payments: gateway integration, platform commission, escrow, seller payouts,
  refunds, double-entry ledger.
- Reviews & ratings: product reviews, seller ratings, moderation.
- Messaging: buyer↔seller threads, admin escalation.
- Promotions: coupons, percentage/flat discounts, campaign scheduling,
  seller-level and platform-level.
- Notifications: email, in-app, push; real-time order/inventory/chat updates.
- Back office: three staff tiers with RBAC, audit log of every privileged action.
- SEO: server-rendered product/category pages, structured data, sitemaps.
- i18n-ready: single locale + single currency at launch, but schema and code
  do not hard-code them (`18` note in NFR).

## 5. Explicitly OUT of scope for v1 (revisit later)

Kept out to protect the MVP timeline. Each is a deliberate deferral, not a "no".

| Deferred | Why deferred | Revisit at |
|----------|--------------|-----------|
| Multi-currency & multi-locale storefront | Huge surface (pricing, tax, rounding, translation ops). Design schema to allow it. | Post-launch |
| Platform-run logistics / warehousing (FBA-style) | Sellers self-fulfil at launch; integrate 3rd-party couriers only. | Phase 3 |
| Advanced ML recommendations / personalization | Start with "popular in category" + "bought together" heuristics. | Phase 3 |
| Subscriptions / recurring orders | Different billing model. | Later |
| Digital goods / downloads | Different fulfilment + tax rules. | Later |
| Seller ad platform (sponsored listings) | Revenue feature, not core. | Later |
| Native mobile apps | Responsive PWA-quality web first. | Later |
| Marketplace lending / seller financing | Regulatory. | Never say never |

## 6. Success metrics (define real targets during review)

- **Product**: GMV, orders/day, conversion rate, cart abandonment, active
  sellers, repeat-purchase rate, dispute rate, refund rate.
- **Engineering**: p95 API latency, storefront LCP, checkout success rate,
  uptime, deploy frequency, change-failure rate, MTTR.
- **Trust**: time-to-moderate a report, time-to-resolve a dispute.

## 7. Guiding principles

1. **Domain first.** Model the business before choosing frameworks.
2. **Boundaries over cleverness.** Clear service/module seams beat premature
   optimization. Split a service only when it earns its own scaling/ownership.
3. **Everything privileged is audited.** Any staff mutation writes an audit event.
4. **Money is double-entry.** Never derive balances by summing ad-hoc queries.
5. **Fail visibly, recover automatically.** Sagas with compensation, retries with
   backoff, dead-letter queues, idempotency keys everywhere writes cross a boundary.
6. **SEO is a requirement, not a nice-to-have.** Storefront pages render on the server.
7. **The back office ships with the feature.** A feature isn't done until staff
   can observe and moderate it.

## 8. Glossary

| Term | Meaning |
|------|---------|
| Listing / Offer | A specific seller's sellable instance of a Product (price, stock, condition). |
| Product | Catalog concept; may have many variants and many seller offers. |
| Variant / SKU | A concrete purchasable configuration (size/color). Stock is tracked per SKU per seller. |
| Sub-order | The portion of an order belonging to one seller; the unit of fulfilment and settlement. |
| Escrow | Funds held by the platform after buyer payment, released to seller on fulfilment. |
| Ledger | Append-only double-entry record of all money movement. |
| Payout | Transfer of released escrow (minus commission) to a seller's bank account. |
| Saga | A multi-step cross-service workflow with defined compensations for each step. |
| RBAC | Role-based access control. |
| ADR | Architecture Decision Record. |
