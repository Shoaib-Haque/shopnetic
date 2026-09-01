# Shopnetic

Multi-vendor e-commerce marketplace. **Monorepo** (pnpm workspaces + Turborepo).

> Phase 0. Landed: the monorepo skeleton; the **Identity & Access** data layer
> (`identity` schema, migrations, seed); **buyer auth** (register → verify email
> via Mailpit → login, JWT + refresh rotation + reuse detection, served through
> the storefront as a BFF); and **RBAC enforcement** (`can()` + `AuthGuard` /
> `@RequirePermission` / `PermissionGuard`, per-request `Actor`, append-only
> audit trail). Next: the staff plane (invite-only, `aud=admin`, TOTP). See
> `plan/` and `plan/21-roadmap-milestones.md`.

## Layout

```
apps/
  storefront/      Next.js — buyer/guest storefront
  seller/          Next.js — seller panel
  admin/           Next.js — back office (obfuscated base segment)
  api/             NestJS — backend (modular monolith)
  realtime/        Socket.IO gateway (stub)
  search-indexer/  search index worker (stub)
  workers/         background job processors (stub)
packages/
  config/          shared tsconfig / eslint / prettier / tailwind preset
  ui/              shadcn-based component wrappers + design tokens
  contracts/       Zod schemas + shared API types (source of truth)
  auth/            RBAC permission catalog + roles + password hashing (can() stub)
  events/          domain event name + payload constants (stub)
  observability/   structured logger + tracing bootstrap (stub)
  i18n/            locale config + Intl formatting helpers (stub)
  db/              Prisma schema (identity context) + client singleton + seed
infra/
  docker/          docker-compose for local services
  terraform/       (deferred — local-first for now)
  k8s/             (deferred)
```

Full rationale: `plan/23-project-structure.md`.

## Prerequisites

- Node `>=22` (`.nvmrc` → `22`)
- pnpm `>=11` (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose (local Postgres / Redis / Mailpit)

## Install

```bash
pnpm install
pnpm lefthook install   # git hooks (format, lint, commitlint)
```

## Local services + database

Host ports are non-default (`5433` Postgres, `6380` Redis) so the stack can run
next to another local Postgres/Redis.

```bash
docker compose -f infra/docker/docker-compose.yml up -d      # postgres, redis, mailpit

cp packages/db/.env.example packages/db/.env                 # DATABASE_URL (+ optional bootstrap admin)
pnpm --filter @shopnetic/db db:migrate                       # apply migrations
pnpm --filter @shopnetic/db db:seed                          # permissions, system roles, role wiring

cp apps/api/.env.example apps/api/.env
pnpm --filter @shopnetic/api dev                             # http://localhost:4000/healthz
```

## Common commands (run from repo root)

```bash
pnpm dev          # run every app in watch mode (Turbo)
pnpm build        # build all
pnpm lint         # lint all
pnpm typecheck    # typecheck all
pnpm test         # test all
pnpm format       # prettier --write
```

Run one app: `pnpm --filter @shopnetic/storefront dev` (append `...` to include its
workspace deps: `pnpm --filter @shopnetic/storefront... build`).

## Per-app docs

Each `apps/*` has its own `README.md` and `.env.example`.

## Conventions

- Coding rules: `plan/CODING-RULES.md` (read before implementing anything).
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:` …), enforced by commitlint.
- Branch off `main`; PRs only.
