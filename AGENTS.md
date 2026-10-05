# AGENTS.md — Shopnetic Engineering Guide for AI Agents

> **Note for AI Agents:** This file is the primary orientation and operating guide for coding agents (Claude Code, Antigravity, etc.) working in the Shopnetic repository. Read this file and `plan/CODING-RULES.md` before inspecting or modifying code.

---

## 1. Project Overview

**Shopnetic** is an Amazon-style multi-vendor e-commerce marketplace built as a high-performance **monorepo** using **pnpm workspaces** and **Turborepo**.

### Core Tenets

- **Modular Monolith First (`ADR-0003`):** Backend (`apps/api`) is structured as a single deployable modular monolith with strict domain boundaries and separate Postgres schemas per bounded context (`identity`, `catalog`, etc.). Modules communicate via published service interfaces and domain events (outbox pattern), enabling seamless microservice extraction when scaling triggers fire.
- **BFF Architecture (`ADR-0002`):** Next.js App Router route handlers act as lightweight Backend-For-Frontend (BFF) layers for `storefront` and `admin`, managing secure HTTP-only cookies and proxying requests to the NestJS API with Bearer JWTs.
- **Dual-Plane Identity & Access Separation (`plan/03`):** Strict boundary between the `marketplace` plane (buyers and sellers) and the `staff` plane (Service Admins, Admins, Super Admins). Sessions, credentials, and tokens never cross planes.
- **Permission-Driven RBAC (`plan/03`, `packages/auth`):** Business logic tests granular permissions (`Permission.*`), never raw role strings.
- **Staff Security & Obfuscation (`plan/03`, `plan/23`):** Staff access is invite-only, enforces mandatory TOTP MFA with recovery codes, and is hosted on an obfuscated base route segment (`/[locale]/x7f2k9t3m1qp/...`, configured via `ADMIN_BASE_PATH`).
- **Server-First Frontend (`plan/09`, `plan/10`):** Next.js App Router with React Server Components (RSC) for maximum SEO and crawlability. `'use client'` is pushed strictly to leaf interactive components.

---

## 2. Tech Stack & Language Versions

| Layer / Concern                 | Technology & Exact Version                                                               | Notes                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Runtime & Node**              | Node.js `>=22.0.0` (pinned `22` in `.nvmrc`)                                             | Native ESM, `--env-file-if-exists`                                      |
| **Package Manager**             | `pnpm@11.3.0` (engines `>=11.0.0`)                                                       | Workspaces configured in `pnpm-workspace.yaml`                          |
| **Monorepo Build System**       | Turborepo `2.10.12`                                                                      | Pipeline defined in `turbo.json`                                        |
| **Language**                    | TypeScript `5.7.3`                                                                       | `strict: true`, `noUncheckedIndexedAccess: true`                        |
| **Backend Framework**           | NestJS `12.0.1` (`@nestjs/platform-express` + Express `5.0.0`)                           | Transpiled with `@swc-node/register` to support `emitDecoratorMetadata` |
| **Database & ORM**              | PostgreSQL 16+ via Prisma ORM `6.3.1`                                                    | Local port `5433` (in `packages/db`)                                    |
| **In-Memory Cache / Store**     | Redis 7+ via `ioredis` `5.4.2`                                                           | Local port `6380` (rate-limiting, sessions, caching)                    |
| **Background Queues**           | BullMQ `6.3.6`                                                                           | Redis-backed job processor in `apps/workers`                            |
| **Mail / SMTP**                 | Nodemailer `6.9.16` + Mailpit (local port `8025`)                                        | Webmail UI at `http://localhost:8025`                                   |
| **Frontend Framework**          | Next.js `16.3.3` (App Router) + React `19.2.8`                                           | RSC, server actions, route handlers                                     |
| **Styling & Design System**     | Tailwind CSS `3.4.17` + Radix UI primitives                                              | Wrapped in `@shopnetic/ui` (Shadcn pattern)                             |
| **Forms & Validation**          | `react-hook-form` `7.54.2` + `@hookform/resolvers` + Zod `3.24.1`                        | Form schemas shared with `@shopnetic/contracts`                         |
| **Internationalization (i18n)** | `next-intl` `4.14.1`                                                                     | URL-based routing (`/[locale]/...`), default `en`                       |
| **Authentication & Crypto**     | `@node-rs/argon2` `2.0.2`, `jose` `5.9.6`, `otplib` `12.0.1`                             | Argon2id, RS256/ES256 JWKS, TOTP                                        |
| **Testing Framework**           | Vitest `2.1.8`, Testing Library React `16.3.3`, jsdom `30.0.1`                           | Fast unit & integration test suites                                     |
| **Linters & Formatters**        | ESLint `9.18.0` (flat config), Prettier `3.4.2`, Commitlint `19.6.1`, Lefthook `1.10.10` | Git hooks run on commit                                                 |

---

## 3. Repository & Folder Structure

```
shopnetic/
├── apps/
│   ├── admin/             # Next.js App Router — Back office / staff portal (port 3002)
│   ├── api/               # NestJS — Modular monolith backend (port 4000)
│   ├── realtime/          # Socket.IO gateway stub — WebSocket notifications (plan/15)
│   ├── search-indexer/    # Worker stub — Search index synchronization (plan/11)
│   ├── seller/            # Next.js App Router — Seller panel stub (port 3001)
│   ├── storefront/        # Next.js App Router — Buyer/guest marketplace (port 3000)
│   └── workers/           # BullMQ background worker — transactional email, jobs (plan/31)
├── packages/
│   ├── auth/              # RBAC catalog, permissions, roles, password hashing, can()/assertCan()
│   ├── config/            # Shared configs: ESLint flat config, tsconfigs, Tailwind preset
│   ├── contracts/         # Zod schemas & shared API DTOs (single source of truth)
│   ├── db/                # Prisma schema (identity, catalog), migrations, seed scripts, client
│   ├── events/            # Domain event names & payload contracts (stub)
│   ├── http-client/       # Typed fetch wrapper with RFC-9457 error translation
│   ├── i18n/              # Locale routing config, translations, Intl helpers
│   ├── observability/     # Structured JSON logger (Pino), OpenTelemetry bootstrap
│   └── ui/                # Shared UI design system: Radix/Shadcn wrappers (Button, Input, Modal, etc.)
├── infra/
│   └── docker/            # docker-compose.yml for local Postgres (:5433), Redis (:6380), Mailpit (:8025)
├── plan/                  # 31 comprehensive architecture documents, ADRs, and CODING-RULES.md
├── package.json           # Root package.json (Turborepo scripts, packageManager: pnpm@11.3.0)
├── pnpm-workspace.yaml    # Workspaces: 'apps/*' and 'packages/*'
├── turbo.json             # Turborepo task pipelines
└── AGENTS.md              # This guide for AI agents
```

---

## 4. Build, Dev, & Test Commands

Always run commands using `pnpm` from the monorepo root (or use `--filter`).

### Local Services Setup

```bash
# 1. Start local dependencies (PostgreSQL on 5433, Redis on 6380, Mailpit on 8025)
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Setup database environment & migrations
cp packages/db/.env.example packages/db/.env
pnpm --filter @shopnetic/db db:migrate
pnpm --filter @shopnetic/db db:seed        # seeds permissions, roles, dev accounts

# 3. Setup app environment files
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/storefront/.env.example apps/storefront/.env
```

### Common Monorepo Commands

```bash
pnpm dev              # Run all applications concurrently via Turborepo
pnpm build            # Build all packages and applications
pnpm typecheck        # Run TypeScript typechecks across all 16 workspaces
pnpm lint             # Run ESLint across all workspaces
pnpm test             # Run unit tests across all workspaces via Vitest
pnpm format           # Run Prettier format write
pnpm format:check     # Verify formatting without modifying files
pnpm clean            # Remove build artifacts and .turbo caches
pnpm prepare          # Install Lefthook git pre-commit hooks
```

### Running Specific Applications & Services

```bash
# Backend API (http://localhost:4000)
pnpm --filter @shopnetic/api dev

# Admin Portal (http://localhost:3002/en/x7f2k9t3m1qp/login)
pnpm --filter @shopnetic/admin dev

# Storefront (http://localhost:3000/en)
pnpm --filter @shopnetic/storefront dev

# Seller Panel (http://localhost:3001)
pnpm --filter @shopnetic/seller dev

# Background Workers (BullMQ queue consumer)
pnpm --filter @shopnetic/workers dev
```

### Running Tests

```bash
# Unit tests for specific apps/packages
pnpm --filter @shopnetic/admin test
pnpm --filter @shopnetic/api test
pnpm --filter @shopnetic/auth test
pnpm --filter @shopnetic/db test

# API Integration tests (requires local PostgreSQL to be running)
pnpm --filter @shopnetic/api test:integration

# Database operations
pnpm --filter @shopnetic/db db:migrate         # Apply pending migrations
pnpm --filter @shopnetic/db db:seed            # Seed permissions & system roles
pnpm --filter @shopnetic/db db:seed:dev        # Seed development accounts & catalog
pnpm --filter @shopnetic/db db:studio          # Open Prisma Studio web GUI
pnpm --filter @shopnetic/db db:reset           # Reset DB and rerun migrations & seed
```

---

## 5. Architectural Notes & Patterns

### 1. Backend: Modular Monolith (`apps/api`)

- Structured by bounded contexts: `identity`, `catalog`, `audit`, `auth`, `crypto`, `queue`, `redis`.
- All requests run through:
  - `CorrelationMiddleware`: Generates/propagates `x-correlation-id` across requests and logs.
  - `AllExceptionsFilter`: Formats all errors into standard RFC-9457 JSON error envelopes (`{ error: { code, message, status, ... } }`).
  - `RateLimitGuard`: Redis sliding-window per-IP rate limiter for auth and mutation endpoints.
- Dev Debug Middlewares (`apps/api/src/common/`):
  - `DEV_AUTH_RELAXED=true`: Skips MFA and email verification in dev (blocked in prod).
  - `DEV_RATE_LIMIT_DISABLED=true`: Bypasses `@RateLimit` guards during testing.
  - `DEV_RESPONSE_DELAY_MS=<ms>` or `x-debug-delay: <ms>`: Injects artificial delay to test UI skeletons/spinners.
  - `DEV_FAULT_STATUS=<code>` or `x-debug-fault: <code>`: Injects synthetic HTTP errors (400, 401, 403, 409, 422, 429, 500, etc.) to verify UI error boundaries.

### 2. Frontend & BFF Pattern (`apps/admin`, `apps/storefront`)

- **BFF Route Handlers (`app/api/...`):** The browser never holds or sees sensitive refresh tokens or raw upstream API keys.
  - Storefront uses `sn_rt` (HTTP-only buyer refresh cookie).
  - Admin uses `sn_srt` (HTTP-only staff refresh cookie) and short-lived `sn_sat` (staff access token cookie used by BFF proxy).
- **Admin Obfuscated Route Base:**
  - Route: `apps/admin/src/app/[locale]/x7f2k9t3m1qp/...`
  - The root `/[locale]` intentionally returns a 404.
  - `redirectIfSignedIn` guards public auth pages (`login`, `accept-invite`, `forgot-password`, `reset-password`) from authenticated visitors.
- **Server Components & Islands:**
  - Layouts, pages, and primary data containers are **Server Components**.
  - Interactive components (forms, modals, buttons, menus) are leaf **Client Components** marked with `'use client'`.

### 3. Identity, RBAC & Permissions (`packages/auth`, `plan/03`)

- **Actors & Planes:** Every request resolves an `Actor` with `plane: 'marketplace' | 'staff'` and assigned `Grant[]`.
- **Granular Permissions:** Endpoints are guarded with `@RequirePermission(Permission.CATEGORY_MANAGE)` or `assertCan(actor, permission)`. Role names (e.g. `ADMIN`, `SUPER_ADMIN`) are merely initial permission bundles and are never hard-coded in business logic checks.
- **Audit Log:** Privileged staff mutations write append-only records to `identity.audit_event` via `AuditService`. Includes previous/new state diffs, readable entity snapshots, and actor attribution.

### 4. Catalog Domain Architecture (`packages/contracts`, `apps/api/src/catalog/`, `plan/26`)

- **Categories:** Tree structure backed by PostgreSQL `ltree` extension for efficient ancestor/descendant queries. Supports drag-and-drop reordering, active/archived soft deletion, and breadcrumb path resolution.
- **Brands:** Distinct from products; supports aliases (`brand_alias`), soft-delete with restore, restricted brand flags, and merge operations (migrating aliases and soft-deleting the source brand).
- **Option Types & Values:** Global attribute catalog (e.g. Color, Size, Storage). Supports data types (`select`, `swatch`, `text`, `number`, `bool`), hex swatches, image chips, and value deprecation.
- **Value Sets:** Predefined, managed sets of option values for standardized category scoping.
- **Category Options:** Scopes which option types apply to a category (applicability: `required`, `optional`, `not_applicable`; variant axis vs informational attribute).
- **Products & Variants:** Normalized model where base `Product` owns options and metadata; `Variant` owns SKU, GTIN, dimensions, weight, and an immutable combination signature (`comboSignature`).
- **Media Assets:** Product/variant photos and videos with optional swatch/option-value tagging for variant-specific galleries.

### 5. UI Deep-Linking Pattern (`apps/admin`)

- List views (Category, Brand, Option Types, Staff) support direct URL targeting (`?target=<id>`).
- Handled by `useHighlightTarget`:
  - Issues a high-priority (`priority: 'high'`) fetch-by-id request.
  - Pins the targeted item to the very top of the list with a highlight tint, independent of whether the item is on page 1 or page 50.
  - Avoids duplication if the row is already in the fetched list.
  - List save handlers update both the local list state and the pinned hook state (`[value, setValue]`).

---

## 6. Code Conventions & Rules (`plan/CODING-RULES.md`)

When modifying or writing code, **strictly adhere** to the locked rules in `plan/CODING-RULES.md`:

### A. Process & Development Flow

- **A1. Ask before you build:** If anything is ambiguous (UX, data shapes, requirements), clarify first.
- **A2. Think the whole flow through:** Map happy paths, edge cases, error states, schema changes, contract updates, BFF proxies, and UI reactions before coding.
- **A3. One change, one purpose:** Do not mix drive-by refactorings with feature implementations.
- **A4. Leave it working:** Never break existing flows or tests. Keep `main` green.
- **A5. Definition of Done:** Code + tests + typecheck clean + lint clean + error/empty states + docs updated.

### B. TypeScript Conventions

- **B1. Zero `any`:** `any` is banned (`@typescript-eslint/no-explicit-any` errors). Use `unknown` + type guards or Zod schemas. Generics and discriminated unions for polymorphic shapes.
- **B2. Strict everywhere:** Strict mode with `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true`.
- **B3. Single Source of Truth:** API/domain types MUST originate from Zod schemas in `@shopnetic/contracts`. Never redefine API types in frontend code.
- **B4. Parse at the boundary, trust inside:** Validate external inputs (requests, query params, cookies, localStorage) with Zod at the perimeter. Trust types internally.
- **B5. No type assertions:** Avoid `as Type` (except `as const` and narrowing guards). `x as unknown as Y` is strictly forbidden.

### C. Next.js, Server Components & SEO

- **C1. `'use client'` only at the leaves:** Never put `'use client'` on layouts, pages, templates, or indexable content sections. Push interactivity to small leaf components.
- **C2. Server shell + client islands:** Server components fetch data and pass props to small client components.
- **C3. Data fetching stays on the server:** Primary page data is fetched on the server (RSC / route handlers). Client-side fetching (TanStack Query / hooks) is reserved for post-load mutations and interactive state.
- **C4. Metadata & SEO:** Every indexable page defines `generateMetadata` (title, description, canonical, OG) and JSON-LD.

### D. Component Architecture & UI

- **D1. Thin wrapper over Shadcn:** Application code imports components from `@shopnetic/ui` (`Button`, `Input`, `Dialog`, `Switch`, etc.), never directly from `@radix-ui` or shadcn.
- **D2. Reuse before write:** Check `@shopnetic/ui` and existing features before authoring new UI primitives.
- **D3. One visual language:** Consistent typography, spacing tokens, and focus rings (`focus-visible:ring-1 focus-visible:ring-ring`).
- **G8. Reversible by undo:** Prefer soft delete with undo toasts (`useSoftDeleteWithUndo`) over disruptive confirmation dialogs for routine deletions.
- **G9. Single Toast shape:** Toasts include countdown `TimerBar` progress indicators matching their display duration.

### E. API, State & Error Handling

- **H1. Contract-first:** Define request/response Zod schemas in `@shopnetic/contracts` before implementing backend endpoints or frontend callers.
- **H2. Standard envelope:** Every endpoint returns `{ data, meta }` on success or `{ error: { code, message, status } }` on error (RFC-9457).
- **H7 / Update Guards:** Mutations on shared resources (Category, Brand, OptionType) use `expectedUpdatedAt` for optimistic concurrency control (`409 CONFLICT` on stale writes).
- **F1 / F2. Error messages:** Never leak raw database errors or stack traces to the user. Distinguish user errors from system errors with localized, user-friendly messages.
- **E1 / E3. UX Feedback:** Every async button displays a loading spinner and disables double submission.

### F. Database & Data Deletion

- **M1 / M2. Migration safety:** Use expand/contract pattern for database migrations. No breaking column renames/drops in live migrations.
- **N1. Soft delete by default:** Entities use `archivedAt` or `archived` flags. Hard delete is reserved for non-recoverable staging data.
- **Q1. Atomic transactions:** Multi-table writes must run in a single Prisma transaction (`prisma.$transaction`).

### G. Internationalization (i18n)

- **L1. Zero hard-coded text:** All user-visible strings must be managed via translation messages (`next-intl`) or `LocalizedText` schemas (`{ en: string, ... }`).
- **L5. Locale from route:** Routes are prefixed with `/[locale]`.

### H. Logging & Observability

- **O1. Structured JSON logging:** Use the logger from `@shopnetic/observability` (Pino). No `console.log` in production code.
- **O2 / O5. Context & Privacy:** Include `correlationId`. Never log credentials, tokens, or PII.

### I. Git & Commit Guidelines

- **J4. Conventional Commits:** Follow the format `type(scope): description` (e.g., `feat(admin,api): add option type management`, `fix(api): handle token expiration`). Valid types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`. Enforced by Commitlint (scope must be kebab-case; use a comma-separated list for multi-app changes).
- **Agents never commit or push (owner's rule):** Do NOT run `git add`, `git commit`, `git push`, `git reset`, or anything else that stages or rewrites history. The owner commits manually. After finishing a change, **provide a suggested commit message** (Conventional Commits format, optional body explaining the why) and stop.
- **Keep commits small:** One purpose per commit (A3). If a change spans unrelated concerns, suggest separate commit messages.
- **Plan docs travel with the code (J5):** If a change alters anything documented in `plan/`, update it in the same change and mention it in the suggested commit message.

### J. Working Agreements With the Owner

- Rules the owner states during a session are recorded here for future agents. Add new ones as they are agreed.

---

## 7. Current Project Status & Feature Map

### Implemented (Done)

- [x] **Monorepo Foundation (Phase 0):** Turborepo, pnpm workspaces, ESLint, Prettier, TypeScript, Lefthook, Docker compose stack.
- [x] **Identity & Access Data Layer:** Accounts, Credentials, Roles, Permissions, Grants, Sessions, Staff Invites, Audit Events, Prisma migrations & seed.
- [x] **Buyer Auth (Storefront BFF + API):**
  - Registration with enumeration-safe response.
  - Email verification with single-use tokens (via Mailpit).
  - Login with JWT access token + rotating `sn_rt` HTTP-only refresh cookie (with token family reuse detection).
  - Logout, session retrieval, unverified login guidance.
- [x] **Staff Auth & Security (Admin BFF + API):**
  - Invite-only staff flow (`staff:manage`).
  - Login with email/password + mandatory TOTP MFA.
  - TOTP enrollment with QR code & recovery code generation.
  - Session tracking & remote device revocation (`sn_srt` / `sn_sat`).
  - Forgot password / reset password flow with short TTL tokens.
  - Change password with session revocation.
- [x] **Admin Portal UI Shell:**
  - Obfuscated base path (`/x7f2k9t3m1qp/`).
  - Responsive layout, collapsible sidebar, breadcrumbs, light/dark mode tokens.
  - Staff management UI (invitations, role reassignment, account activation/deactivation, TOTP reset, deprovisioning).
  - Staff session manager (view active sessions, revoke specific or all other devices).
  - Audit log viewer (filtering by action/actor/date, JSON diff viewer, target deep-linking).
- [x] **Catalog Governance (Admin & API - Phase 1 in progress):**
  - Category Management: Hierarchical tree view, drag-and-drop reordering, create/edit modal, soft-delete with undo, restore, breadcrumb pool, status tabs (active/archived/all), server-side token search.
  - Brand Management: Brand list, create/edit modal, brand merge dialog (transfers aliases, soft-deletes source), aliases management, restricted brand toggle, soft-delete with undo, restore.
  - Option Types & Values: Global catalog list, create/edit modal, swatch/data type configurations, option values management, soft delete with undo.
  - Deep-link highlighting: `useHighlightTarget` hook with `priority: 'high'` fetch across Category, Brand, Option Types, Staff.
- [x] **Catalog Backend APIs (`apps/api/src/catalog/`):**
  - Endpoints & services implemented for: Categories, Brands, Option Types, Value Sets, Category Options, Products, Product Options, Variants, and Media Assets.
- [x] **Background Worker Service (`apps/workers`):**
  - BullMQ email consumer processing mail jobs and delivering via Nodemailer.

---

### What Still Left / In-Progress

#### Phase 1: Catalog & Discovery (Current Phase)

1. **Admin Catalog UI Completion:**
   - [ ] Product management UI (create/edit products, category selection, brand association, specs).
   - [ ] Product option configuration UI (selecting option types and offering subset values).
   - [ ] Variant matrix generator UI (generating SKUs from option axes, setting SKU code, GTIN, dimensions, weight).
   - [ ] Product media gallery UI (uploading images/videos, tagging media to specific option values for variant galleries).
   - [ ] Category-Option mapping UI (configuring required/optional attributes per category).
2. **Seller Portal (`apps/seller` - Currently a stub):**
   - [ ] Seller registration & shop profile setup.
   - [ ] Seller product management & catalog search.
   - [ ] Offer management (pricing, stock levels, condition).
   - [ ] Bulk CSV import for inventory.
3. **Search & Indexing Engine (`apps/search-indexer` - Currently a stub):**
   - [ ] Integrate Meilisearch / OpenSearch client.
   - [ ] Catalog outbox event listener for products/variants/brands/categories.
   - [ ] Search query API with facets, filters, autocomplete, and token ranking.
4. **Storefront Browsing Experience (`apps/storefront`):**
   - [ ] Home page with ISR and curated category blocks.
   - [ ] Category browse & facet filtering.
   - [ ] Product Detail Page (PDP): SSR/ISR, dynamic variant selection, image galleries, breadcrumbs, JSON-LD structured data.
   - [ ] Brand directory page.
5. **Media & Storage Pipeline:**
   - [ ] S3/MinIO signed upload URL generation for product media and brand logos.
   - [ ] Image optimization and blurhash generation pipeline.

#### Phase 2: Transactional MVP (Public Launch Gate)

- [ ] **Cart:** Guest cart (Redis) + buyer cart (DB), merge on login, stock/price change alerts (`plan/29`).
- [ ] **Coupons & Promotions:** Platform and seller coupon engine, race-safe redemption limits.
- [ ] **Stock Reservations:** Atomic decrements with TTL holds and reservation sweeper.
- [ ] **Checkout Saga:** Multi-seller order splitting, address serviceability, shipping rates, single-jurisdiction tax calculation, idempotent placement.
- [ ] **Payments & Ledger:** Payment gateway integration (Stripe/Adyen), double-entry ledger, escrow hold, refund processing.
- [ ] **Order Lifecycle:** Seller pack/ship, tracking number attachment, buyer order tracking, pre-ship cancellations.
- [ ] **Seller KYC & Payouts:** Identity document review, bank account verification, scheduled payout runs.
- [ ] **Reviews & Ratings:** Verified-purchase product reviews, seller ratings, moderation queue.
- [ ] **Customer Support & Trust:** User report flow, review moderation, dispute resolution.

#### Phase 3 & 4: Marketplace Depth & Scale

- [ ] Returns/RMA automated flows, carrier shipping label generation.
- [ ] Buyer-Seller real-time messaging with attachments.
- [ ] Recommendation engine ("customers also bought", "frequently viewed together").
- [ ] Service Admin support console (canned responses, macros, ticket SLA timers).
- [ ] Analytics warehouse (ClickHouse/BigQuery) with seller performance dashboards.
- [ ] Multi-currency and multi-locale marketplace expansion.

---

## 8. Essential Plan & Architecture Documentation Index

When deep-diving into specific domains, consult the respective document in `plan/`:

| Topic                   | Primary Plan Document                        | Key Concerns Addressed                                 |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| **Coding Standards**    | `plan/CODING-RULES.md`                       | Working agreements, TS/Next.js/UI/API/DB/Log rules     |
| **System Architecture** | `plan/02-architecture.md`                    | Monolith-first, bounded contexts, topology, outbox     |
| **RBAC & Auth**         | `plan/03-users-and-rbac.md`                  | Actors, roles, permission matrix, token contracts      |
| **Data Model**          | `plan/07-data-model.md`                      | Schemas, relations, constraints, deletion strategies   |
| **API Conventions**     | `plan/08-api-design.md`                      | REST conventions, RFC-9457 error envelopes, pagination |
| **Frontend Strategy**   | `plan/09-frontend-architecture.md`           | App Router structure, RSC boundaries, state, forms     |
| **SEO Strategy**        | `plan/10-seo-strategy.md`                    | Metadata, JSON-LD, sitemaps, CWV budgets               |
| **Catalog & Variants**  | `plan/26-catalog-options-variants-brands.md` | Options, SKUs, combinations, brands, media tags        |
| **Cart & Checkout**     | `plan/12-cart-checkout-orders.md`            | Cart merge, order splitting, checkout saga, refunds    |
| **Payments & Escrow**   | `plan/13-payments-and-payouts.md`            | Gateways, double-entry ledger, escrow, payouts         |
| **Background Queues**   | `plan/31-background-jobs-and-queues.md`      | BullMQ architecture, outbox relay, job catalog         |
| **Database Safety**     | `plan/25-database-conventions.md`            | Expand/contract migrations, soft deletion rules        |
| **Roadmap & Gates**     | `plan/21-roadmap-milestones.md`              | Delivery phases, MVP cut lines, launch criteria        |
| **Risks & Open Decs**   | `plan/22-risks-and-open-questions.md`        | Risk register, open architectural decisions            |
