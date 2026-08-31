# Shopnetic — Planning Workspace

This directory holds the **living design plan** for Shopnetic, an Amazon-style
multi-vendor e-commerce platform. Nothing here is code. The goal is to lock the
*logical* decisions (domain model, service boundaries, contracts, roles) before
writing implementation code, so that adding features later is cheap and safe.

## How to read this

Start at `00-vision-and-scope.md`, then `01-tech-stack.md` and
`02-architecture.md`. Everything else is a deep-dive on one concern.

| File | Concern |
|------|---------|
| `CODING-RULES.md` | **How we write code** — the working agreement followed on every PR (read before implementing anything) |
| `00-vision-and-scope.md` | What we are building, what we are explicitly NOT building (yet), success metrics, glossary |
| `01-tech-stack.md` | Chosen technologies + why each, rejected alternatives |
| `02-architecture.md` | Service decomposition, communication, data ownership, deployment topology |
| `03-users-and-rbac.md` | Actor list, role hierarchy, permission matrix, auth model |
| `04-features-buyer.md` | Buyer / guest feature list, flows, edge cases |
| `05-features-seller.md` | Seller feature list, onboarding, shop management, edge cases |
| `06-features-admin.md` | Super Admin / Admin / Service Admin feature list |
| `07-data-model.md` | Core entities, relationships, per-service schema ownership, key invariants |
| `08-api-design.md` | API style, versioning, pagination, error envelope, idempotency, auth headers |
| `09-frontend-architecture.md` | Next.js app structure, rendering strategy, design system, state, forms |
| `10-seo-strategy.md` | SSR/ISR rules, metadata, structured data, sitemaps, Core Web Vitals |
| `11-search-and-catalog.md` | Catalog modeling, search engine, indexing pipeline, facets, ranking |
| `12-cart-checkout-orders.md` | Cart model, checkout flow, order lifecycle, order-splitting, saga/compensation |
| `13-payments-and-payouts.md` | Payment gateways, escrow, seller payouts, refunds, ledger |
| `14-caching-strategy.md` | Cache layers, keys, TTLs, invalidation, stampede protection |
| `15-realtime-and-notifications.md` | WebSocket use cases, notification service, channels, templates |
| `16-security.md` | AuthN/AuthZ, OWASP, secrets, PII, rate limiting, fraud, compliance |
| `17-infrastructure-devops.md` | Repo layout, containers, orchestration, environments, CI/CD, IaC |
| `18-observability.md` | Logging, metrics, tracing, dashboards, alerting, SLOs |
| `19-testing-strategy.md` | Test pyramid, contract tests, E2E, load tests, test data, coverage gates |
| `20-non-functional-requirements.md` | Performance budgets, availability, scalability targets, data retention |
| `21-roadmap-milestones.md` | Phased delivery plan, MVP cut line, sequencing |
| `22-risks-and-open-questions.md` | Risk register + decisions still owed |
| `23-project-structure.md` | Monorepo + per-app `src/` layout (`app` thin, `features/`), obfuscated admin segment, per-app package.json/.env/README |
| `24-i18n-localization.md` | Locale routing, message catalogs, localized error messages, localized content fields, `Intl` formatting |
| `25-database-conventions.md` | Migration safety (expand/contract), soft vs hard delete + FK behavior, transaction rules |
| `26-catalog-options-variants-brands.md` | Option types/values, per-product option config, variants/SKUs, per-variant price+stock, option-tagged media, brands + brand requests |
| `27-merchandising-and-ranking.md` | Landing/category ordering, signal capture, blended multi-layer ranking, "also viewed"/"related" |
| `28-page-loading-and-rendering.md` | Progressive PDP sections, optional-section hiding, hybrid pagination/infinite scroll, image/streaming strategy |
| `29-cart-and-listing-change-alerts.md` | One-time "your cart changed" notices (price/stock/delisted) for returning buyers |
| `30-reporting-and-analytics.md` | Admin & seller business reports — dimensions, rollup pipeline, provisional vs final, exports |
| `adr/` | Architecture Decision Records — one file per irreversible decision (see `adr/README.md`) |

### ADRs written so far

- `adr/0001-monorepo.md` — monorepo (pnpm + Turborepo)
- `adr/0002-rest-over-graphql.md` — REST + BFF, not GraphQL (for now)
- `adr/0003-modular-monolith-first.md` — modular monolith, extract services on trigger

## Conventions for keeping this updated

1. **Every non-trivial decision becomes an ADR** in `adr/` using
   `adr/0000-template.md`. The deep-dive files link to the ADR; they do not
   re-argue it.
2. **Status tags** at the top of each file: `DRAFT` → `REVIEWED` → `LOCKED`.
   `LOCKED` means changing it requires an ADR that supersedes.
3. **Open questions** live in `22-risks-and-open-questions.md` with an owner and a
   "needed-by" milestone. Do not bury TODOs inside prose.
4. Keep a **Changelog** section at the bottom of files that change often
   (data model, API design, roadmap).
5. Prefer tables and bullet lists over paragraphs. This is a reference, not an essay.

## Current status

Everything is `DRAFT`. First review pass pending.
