# Shopnetic

Multi-vendor e-commerce marketplace. **Monorepo** (pnpm workspaces + Turborepo).

> Phase 0. Landed: the monorepo skeleton; the **Identity & Access** data layer;
> **buyer auth** (register → verify email via Mailpit → login, JWT + refresh
> rotation + reuse detection, served through the storefront as a BFF); **RBAC
> enforcement** (`can()` + guards, per-request `Actor`, append-only audit trail);
> the **staff plane** (invite-only, `aud=admin` tokens, mandatory TOTP + recovery
> codes) — API and the admin login/accept-invite UI at `x7f2k9t3m1qp`. That
> finishes Phase 0 Identity & Access. See `plan/` and
> `plan/21-roadmap-milestones.md`.

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
  auth/            RBAC — permission catalog, roles, can()/assertCan(), password hashing
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
cp apps/storefront/.env.example apps/storefront/.env
cp apps/admin/.env.example apps/admin/.env
pnpm --filter @shopnetic/api dev                             # API   → http://localhost:4000/healthz
pnpm --filter @shopnetic/storefront dev                      # buyer → http://localhost:3000
pnpm --filter @shopnetic/admin dev                           # staff → http://localhost:3002
```

Seed a first staff Super Admin: set `BOOTSTRAP_SUPERADMIN_EMAIL` /
`BOOTSTRAP_SUPERADMIN_PASSWORD` in `packages/db/.env` **before** `db:seed`.

## Try it in the browser

### Buyer / guest — http://localhost:3000 (→ `/en`)

1. **Create account** → any email + password (≥ 8 chars).
2. Open **http://localhost:8025** (Mailpit) → click the confirm link in the email.
3. **Sign in** → the home strip shows "Signed in as …" + Sign out.

Full flow (unverified-login, resend, rate limits): `apps/storefront/README.md`.

### Staff (Super Admin / Admin / Service Admin) — http://localhost:3002/en/x7f2k9t3m1qp/login

Staff are **invite-only** and share one login surface — there is no per-role URL;
what a staff member can see is decided by their permissions.

1. **Sign in** with the bootstrap Super Admin (email + password from
   `packages/db/.env`).
2. First sign-in shows a **TOTP setup** step — add the shown secret to an
   authenticator app (manual key entry), enter the 6-digit code, save the
   recovery codes → dashboard.
3. Later sign-ins: email + password → 6-digit code (or a recovery code).
4. Invite another staff member from the dashboard (`staff:manage`, Super Admin
   only) → the invite link (in Mailpit) opens `…/x7f2k9t3m1qp/accept-invite`.

`apps/admin/README.md` has the endpoint/BFF details; `apps/api/README.md` has the
`curl` recipe and the full endpoint list.

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
