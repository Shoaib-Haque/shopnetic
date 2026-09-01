# Shopnetic

Multi-vendor e-commerce marketplace. **Monorepo** (pnpm workspaces + Turborepo).

> This repo is currently a **skeleton** — structure + tooling only. No database,
> no domain features yet. See `plan/` for the full design and `plan/21-roadmap-milestones.md`
> for what comes next.

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
  auth/            RBAC permission constants + authorize() (stub)
  events/          domain event name + payload constants (stub)
  observability/   structured logger + tracing bootstrap (stub)
  i18n/            locale config + Intl formatting helpers (stub)
  db/              Prisma schema + client singleton (no models yet)
infra/
  docker/          docker-compose for local services
  terraform/       (deferred — local-first for now)
  k8s/             (deferred)
```

Full rationale: `plan/23-project-structure.md`.

## Prerequisites

- Node `>=22` (`.nvmrc` → `22`)
- pnpm `>=11` (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose (for local Postgres/Redis when we wire the DB)

## Install

```bash
pnpm install
pnpm lefthook install   # git hooks (format, lint, commitlint)
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

## Local services

```bash
docker compose -f infra/docker/docker-compose.yml up -d   # postgres, redis, mailpit
```

Nothing depends on these yet in the skeleton.

## Per-app docs

Each `apps/*` has its own `README.md` and `.env.example`.

## Conventions

- Coding rules: `plan/CODING-RULES.md` (read before implementing anything).
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:` …), enforced by commitlint.
- Branch off `main`; PRs only.
