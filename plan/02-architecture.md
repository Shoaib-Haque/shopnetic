# 02 — Architecture

Status: DRAFT
Related: `adr/0001-monorepo.md`, `adr/0003-modular-monolith-first.md`, `07-data-model.md`

## 1. Stance: modular monolith first, microservices when earned

The brief says "microservice so we can scale later". The trap is building 10
services on day one and drowning in distributed-systems overhead (network
failures, eventual consistency, deploy choreography) before we have a single
paying customer.

**Decision (ADR-0003): start as a modular monolith with hard internal
boundaries, extract services along those boundaries when a concrete trigger
fires.** We get microservice *readiness* without the microservice *tax*.

What "hard boundaries" means from day one:

- Each bounded context is its own Nest module with its **own Postgres schema**.
- Modules talk **only** through published interfaces (a service class today, a
  network call tomorrow) and **domain events** — never by reaching into another
  module's tables.
- No cross-schema foreign keys. References across contexts are by ID + async
  reconciliation.
- All cross-context writes already use the **outbox pattern** and idempotency
  keys, so extraction is a deployment change, not a rewrite.

### Extraction triggers (extract a module into its own deployable when ANY is true)

- It needs to scale independently (e.g. Search, Realtime, Media processing).
- It has a different availability/latency profile (e.g. Payments must stay up
  during a catalog outage).
- A separate team owns it and release cadence conflicts.
- Its resource usage (CPU/RAM) starves co-located modules.

## 2. Bounded contexts

| Context | Responsibility | Likely early extraction? |
|---------|----------------|--------------------------|
| **Identity & Access** | Accounts, sessions, JWT/refresh, roles, permissions, staff invites, audit log | No |
| **Seller** | Seller registration, KYC/verification state, shop profile, seller settings | No |
| **Catalog** | Categories, brands, products, variants, attributes, media refs | No |
| **Inventory & Offers** | Per-seller offers (price, stock, condition), stock reservations | Maybe (checkout hot path) |
| **Search** | Read-model index, query API, facets, ranking | **Yes** (independent scaling) |
| **Cart** | Guest + user carts, cart merge, price/stock revalidation | No |
| **Pricing & Promotions** | Coupons, campaigns, discount rules, price calculation | No |
| **Checkout / Orders** | Order creation saga, sub-orders, order lifecycle, cancellations, returns | Maybe |
| **Payments & Ledger** | Gateway integration, escrow, double-entry ledger, refunds | **Yes** (availability isolation) |
| **Payouts** | Seller balance, payout scheduling, bank transfer integration, statements | Maybe |
| **Shipping** | Shipping options, rates, courier integration, tracking updates | Maybe |
| **Reviews & Ratings** | Product reviews, seller ratings, moderation queue hooks | No |
| **Messaging** | Buyer↔seller threads, attachments, admin escalation | Maybe (realtime load) |
| **Notifications** | Template rendering, email/push/in-app dispatch, preferences | **Yes** (spiky load, 3rd-party latency) |
| **Realtime Gateway** | WebSocket fan-out for orders/inventory/chat/notifications | **Yes** (stateful connections) |
| **Trust & Safety** | Reports, moderation queues, dispute case management, policy actions | No |
| **Admin/Back-office API** | Aggregates the above for staff UIs, enforces staff RBAC | No (BFF) |
| **Analytics/Reporting** | Rollups, dashboards, exports | Later |

## 3. Runtime topology (target, post-extraction)

```
                    ┌────────────┐
   Browser ───────► │    CDN     │  (static + ISR storefront pages, images)
                    └─────┬──────┘
                          ▼
                 ┌──────────────────┐
                 │   API Gateway    │  TLS, routing, global rate limit, WAF
                 └───┬─────────┬────┘
                     ▼         ▼
        ┌────────────────┐  ┌────────────────────┐
        │  Storefront BFF │  │   Admin/Seller BFF │   (Next.js route handlers
        │  (Next.js /api  │  │   (NestJS)          │    or dedicated Nest BFF)
        │   or Nest)      │  └─────────┬──────────┘
        └───────┬─────────┘            │
                ▼    ▼    ▼    ▼    ▼   ▼
        ┌───────────────────────────────────────┐
        │        Domain services (Nest)          │
        │  identity · catalog · inventory ·      │
        │  cart · pricing · orders · payments ·  │
        │  payouts · shipping · reviews ·        │
        │  messaging · notifications · t&s       │
        └───────┬───────────────┬────────────────┘
                │               │
        ┌───────▼──────┐  ┌─────▼───────────┐
        │  PostgreSQL  │  │  RabbitMQ/NATS  │  (events + commands, DLQ)
        │ (schema/svc) │  └─────┬───────────┘
        └──────────────┘        │
        ┌──────────────┐  ┌─────▼───────┐  ┌────────────┐  ┌───────────────┐
        │    Redis     │  │  Search svc │  │ Realtime   │  │ Object store  │
        │ cache/jobs/  │  │ + OpenSearch│  │ (Socket.IO)│  │ + CDN         │
        │ rate-limit   │  └─────────────┘  └────────────┘  └───────────────┘
        └──────────────┘
```

At MVP this collapses to: Next.js app + one Nest app (all modules) + Postgres +
Redis + Search + object storage. RabbitMQ can be in-process events initially,
swapped for the broker before the first extraction.

## 4. Communication patterns

| Pattern | When | Notes |
|---------|------|-------|
| **Sync request/response** (REST/HTTP or Nest RPC) | Read that the caller must have *now* (product detail, price quote, cart) | Timeouts + circuit breakers mandatory. Never chain >2 sync hops. |
| **Async events** (pub/sub) | State changed, others may care (`order.placed`, `payment.captured`, `offer.stock_changed`) | Fire-and-forget, at-least-once, consumers idempotent. |
| **Async commands** (queue) | Do this reliably, eventually (`notification.send`, `payout.execute`, `search.reindex`) | Retries + DLQ + alert on DLQ depth. |
| **Saga / process manager** | Multi-service workflow needing rollback (checkout, refund, seller offboarding) | Explicit state machine, compensations per step. See `12-cart-checkout-orders.md`. |

### Reliability rules

- **Outbox pattern**: services write domain events to an `outbox` table in the
  same transaction as the state change; a relay publishes them. No lost events,
  no dual-write inconsistency.
- **Inbox / dedupe**: consumers record processed message IDs; re-delivery is a no-op.
- **Idempotency keys** on every externally-triggered write endpoint (checkout,
  payment webhook, admin bulk action).
- **Correlation ID** propagated on every request and message for tracing.

## 5. Data ownership

- One schema per context; the owning service is the **only** writer.
- Other services get data via (a) sync read API, (b) subscribing to events and
  keeping a local **read-model copy** of just the fields they need.
- Example: Orders keeps a denormalized snapshot of product title / price / seller
  at time of purchase — orders must be immutable against later catalog edits.

## 6. Environments

| Env | Purpose | Data |
|-----|---------|------|
| `local` | Developer machine, docker-compose | Seed script |
| `preview` | Ephemeral per-PR | Seed + anonymized subset |
| `staging` | Pre-prod, mirrors prod infra | Anonymized prod-like |
| `production` | Live | Real |

## 7. What we are NOT doing

- No shared database across services.
- No synchronous call graphs more than 2 deep on a user-facing request.
- No distributed transactions (2PC). Sagas + eventual consistency instead.
- No service without its own health check, metrics, dashboard, and runbook.

## Changelog

- _(date)_ — Initial draft.
