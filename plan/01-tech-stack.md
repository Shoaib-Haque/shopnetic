# 01 — Tech Stack

Status: DRAFT
Related: `adr/0001-monorepo.md`, `adr/0002-rest-over-graphql.md`, `02-architecture.md`

## Principle

Pick boring, well-documented, TypeScript-native tools so one language spans the
whole stack and hiring is easy. Introduce a new technology only when an existing
one demonstrably can't do the job.

## Frontend

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | **Next.js (App Router)** | Server components + streaming SSR give the SEO and TTFB we need for a storefront; file-based routing; mature ecosystem. |
| Language | **TypeScript (strict)** | Shared types with backend; catches integration bugs at compile time. |
| UI kit | **shadcn/ui + Tailwind CSS** | Copy-in components we own and can theme; no runtime lock-in; one design language for storefront + all admin panels. |
| Component variants | **CVA (class-variance-authority)** | Type-safe variant styling, pairs with shadcn. |
| Data fetching (client) | **TanStack Query** | Caching, background refetch, mutation/optimistic UI; complements RSC for interactive islands. |
| Forms | **React Hook Form + Zod** | Zod schemas shared with the API for one source of validation truth. |
| Charts (admin) | **Recharts** or **visx** | Dashboards for admin/seller analytics. Decide during admin build. |
| Tables (admin) | **TanStack Table** | Headless, handles the big data grids in admin/seller panels. |
| i18n | **next-intl** | Even if launching one locale, wrap strings from day one so we don't retrofit. |
| Testing | **Vitest + React Testing Library + Playwright** | Unit/component + cross-browser E2E. |

### Rendering strategy (summary; full rules in `10-seo-strategy.md`)

- Storefront **public** pages (home, category, product, search landing): SSR /
  ISR, cacheable at the CDN.
- **Authenticated** pages (account, cart, checkout, seller panel, admin): CSR /
  SSR with `no-store`, never cached.
- Use RSC for data-heavy read views; client components only for interactivity.

## Backend

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | **NestJS** | Opinionated modular structure (modules/providers/DI) maps cleanly onto bounded contexts; first-class microservice transports; guards/interceptors/pipes fit auth, logging, validation. |
| Language | **TypeScript (strict)** | Same as frontend; share DTO/validation packages. |
| API style | **REST + OpenAPI** for external/BFF; **async messages** between services | REST is cache-friendly and simple for the storefront/CDN; see ADR-0002. |
| Validation | **Zod** (or class-validator) at every boundary | Reject bad input at the edge; generate OpenAPI from schemas. |
| ORM | **Prisma** | Type-safe queries, migrations, great DX. Fallback: Drizzle if we need finer SQL control on hot paths. |
| AuthN | **JWT access (short TTL) + rotating refresh tokens**, argon2id password hashing | Stateless access tokens scale horizontally; refresh rotation limits theft window. See `16-security.md`. |
| Background jobs | **BullMQ (Redis)** | Retries, delayed jobs, repeatable jobs for payouts/emails/index sync. |
| Inter-service messaging | **RabbitMQ** (commands + events) — or **NATS** if we want lighter ops | Reliable delivery, DLQ, routing. Kafka only if event volume/replay demands it later. |
| Realtime | **Socket.IO** service backed by **Redis adapter** | Horizontal scale of websocket fan-out; rooms per user/order/thread. |
| Search | **OpenSearch** (or Meilisearch for MVP speed) | Facets, relevance tuning, typo tolerance. See `11-search-and-catalog.md`. |
| File/media | **S3-compatible object storage** + CDN; **imgproxy**/Next Image for resizing | Offload large binaries; signed upload URLs. |

## Data stores

| Store | Use | Why |
|-------|-----|-----|
| **PostgreSQL** | System of record for every service (one logical DB/schema per service) | ACID, relational integrity for orders/ledger, JSONB for flexible attributes. |
| **Redis** | Cache, session/refresh-token denylist, rate-limit counters, BullMQ, Socket.IO adapter, cart (guest) | Fast, versatile, already needed for jobs. |
| **OpenSearch** | Product search index (read model) | Not a source of truth; rebuildable from Postgres. |
| **Object storage (S3)** | Images, invoices (PDF), exports | Cheap, CDN-frontable. |
| **ClickHouse** (later) | Analytics/event warehouse for dashboards | Only when Postgres aggregation hurts. Deferred. |

## Cross-cutting / platform

| Concern | Choice | Why |
|---------|--------|-----|
| Repo | **Monorepo (pnpm workspaces + Turborepo)** | Shared types/config/UI, atomic cross-cutting changes, one CI. See ADR-0001. |
| Containers | **Docker**, multi-stage builds | Reproducible envs. |
| Orchestration | **Kubernetes** (managed) for prod; **docker-compose** for local | Rolling deploys, HPA autoscaling, per-service resource limits. |
| API gateway | **Kong / Traefik / Nginx** or a thin **NestJS BFF** | TLS, routing, rate limiting, auth pre-check. Start with BFF, add gateway when service count grows. |
| IaC | **Terraform** | Versioned infra, reproducible environments. |
| CI/CD | **GitHub Actions** | Lint → typecheck → test → build → image → deploy; preview envs per PR. |
| Secrets | **Doppler / Vault / cloud secret manager** | No secrets in env files or repo. |
| Observability | **OpenTelemetry** → **Grafana stack** (Loki logs, Tempo traces, Prometheus/Mimir metrics) or **Grafana Cloud / Datadog** | One tracing standard across services. See `18-observability.md`. |
| Error tracking | **Sentry** (frontend + backend) | Release health, source maps, alerting. |
| Email | **Resend / SES / Postmark** | Transactional deliverability. |
| Feature flags | **Unleash / OpenFeature** | Decouple deploy from release; kill-switches. |

## Shared packages (monorepo)

- `@shopnetic/contracts` — Zod schemas + generated TS types + OpenAPI, shared by FE and all services.
- `@shopnetic/ui` — shadcn-based component library + theme tokens.
- `@shopnetic/config` — eslint, tsconfig, tailwind preset, prettier.
- `@shopnetic/observability` — logger, tracing bootstrap, metrics helpers.
- `@shopnetic/auth` — token verification, RBAC guard, permission constants.
- `@shopnetic/events` — event name constants + payload schemas + publisher/consumer helpers.

## Rejected / deferred alternatives (short)

| Rejected | Instead of | Reason |
|----------|-----------|--------|
| GraphQL federation | REST + BFF | Extra infra + caching complexity; REST is fine for our access patterns. Revisit if FE needs highly variable graphs. See ADR-0002. |
| Kafka (day 1) | RabbitMQ/NATS | Operational weight not justified until we need high-throughput replayable streams. |
| MongoDB as SoR | PostgreSQL | Orders/ledger need transactions and joins; JSONB covers flexible fields. |
| Polyrepo | Monorepo | Cross-service type drift, coordination overhead. See ADR-0001. |
| Prisma-less raw SQL everywhere | Prisma | DX + migration safety; drop to raw SQL only on measured hot paths. |
| Serverless functions for core services | Long-running Nest services | Websockets, warm caches, connection pools, predictable latency. Serverless OK for isolated glue tasks. |
