# ADR 0002 — REST + BFF over GraphQL (for now)

- **Status:** Accepted (revisit — see `22` Q21)
- **Date:** 2026-08-31
- **Deciders:** founding engineering
- **Related:** `08-api-design.md`, `09-frontend-architecture.md`, `14-caching-strategy.md`

## Context

The storefront needs page-shaped data with excellent caching for SEO; the seller
and admin panels need CRUD + big filtered tables; services need to talk to each
other. We must choose the primary API paradigm before building the BFF and the
first endpoints. Team is small; ops budget is limited.

## Options considered

### Option A — GraphQL (single schema, e.g. Apollo/Yoga) + optional federation
- Pros: clients request exactly the fields they need; one graph; great DX for
  highly variable UI; introspective docs; good for a future public partner API.
- Cons: HTTP caching is hard (POST, single endpoint) → need persisted queries +
  APQ + a GraphQL-aware CDN/edge cache to get what REST gets for free;
  federation/gateway is real operational weight; N+1 needs dataloaders
  everywhere; rate-limiting/cost-analysis needed to stop expensive queries;
  another layer to secure and monitor; overkill for mostly-predictable access
  patterns.

### Option B — REST (resource endpoints) + a BFF that composes page responses
- Pros: `GET` + URLs → CDN/`Cache-Control`/`ETag` caching works out of the box
  (critical for storefront SEO, `10`/`14`); simple to reason about, secure, rate-
  limit, and monitor; OpenAPI → generated typed client + docs + contract tests;
  the BFF shapes exactly the payload each page needs so the browser still makes
  few round-trips; services expose plain REST/RPC internally.
- Cons: some over/under-fetching without a BFF; more endpoints to design;
  BFF is another component to build (but small and owned by FE).

### Option C — tRPC
- Pros: end-to-end types with zero schema step; fast for a TS monorepo.
- Cons: couples clients to server internals; weak for public/partner APIs and
  non-TS consumers; HTTP caching story similar problem to GraphQL for reads;
  less standard for a multi-surface product.

## Decision

We will use **REST/JSON with OpenAPI as the contract**, fronted by a **BFF** per
surface (Next.js route handlers for storefront, a Nest BFF for seller/admin) that
composes multiple service calls into page-shaped responses. Inter-service calls
are REST or Nest RPC plus async events. GraphQL is **not** adopted now.

## Consequences

- Positive: storefront reads are edge-cacheable by default → best SEO/CWV and
  lowest cost; smaller attack/observability surface; contract-first workflow
  (`@shopnetic/contracts` → OpenAPI → typed client → Pact/contract tests);
  easy for future non-TS / partner consumers.
- Negative / trade-offs: we hand-design endpoint shapes and maintain the BFF;
  some endpoints return more than a given screen needs; if FE data needs become
  very graph-like we'll feel the friction.
- Follow-up: lock the response envelope, pagination, error, and idempotency
  conventions in `08`; set up OpenAPI generation + breaking-change detection in
  CI.
- Revisit if (Q21): we build a public partner API, or FE teams repeatedly need
  highly variable nested reads that the BFF can't serve cleanly — then consider
  adding a GraphQL layer **on top of** the REST services for those specific
  consumers, not as a wholesale replacement.
