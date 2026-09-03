# 23 — Project / Directory Structure

Status: DRAFT
Related: `adr/0001-monorepo.md`, `17-infrastructure-devops.md`, `09-frontend-architecture.md`, `CODING-RULES.md` §C/§D

Reconciles the founder's per-project `src/` layout (from a previous project) with
the monorepo decision (ADR-0001). **The plan comes first**: we keep the monorepo,
and adopt the founder's *internal* app layout (`app/` thin, `features/` for domain
code, obfuscated admin segment, `proxy.ts` middleware) inside each Next.js app.

## 1. Top level (monorepo — pnpm workspaces + Turborepo)

```
shopnetic/
├── apps/
│   ├── storefront/        # Next.js — buyer/guest, www.shopnetic.com
│   ├── seller/            # Next.js — seller panel, seller.shopnetic.com
│   ├── admin/             # Next.js — back office, admin.shopnetic.com
│   ├── api/               # NestJS — modular monolith (all bounded-context modules)
│   ├── realtime/          # Socket.IO gateway (extracted early)
│   ├── search-indexer/    # worker
│   └── workers/           # BullMQ processors (payouts, emails, exports, reindex, rollups)
├── packages/
│   ├── contracts/         # Zod schemas → generated OpenAPI + typed client (shared)
│   ├── ui/                # shadcn wrappers + tokens + theme (shared by all 3 frontends)
│   ├── auth/              # token verify, RBAC guard, permission constants
│   ├── events/            # event names + payload schemas + pub/sub helpers
│   ├── observability/     # logger, tracing, metrics bootstrap
│   ├── i18n/              # shared i18n config, Intl helpers, message-key types (see `24`)
│   ├── db/                # prisma schema(s), migrations, seed  (see `25`)
│   └── config/            # eslint, tsconfig, tailwind preset, prettier
├── infra/
│   ├── terraform/
│   ├── k8s/
│   └── docker/            # base images + docker-compose for local
├── .github/workflows/
├── package.json           # workspace root (dev tooling only)
├── pnpm-workspace.yaml
├── turbo.json
└── README.md              # monorepo overview + "how to run everything"
```

### Why still a monorepo (not separate repos)

ADR-0001 stands: shared `contracts`/`ui`/`auth`/`events` must not drift, and
cross-cutting changes (change an API contract, update all 3 frontends) must be one
reviewed PR. **But** each app in `apps/*` is independently installable and
runnable (see §4) — you get the "clone one folder, install, run" benefit without
the type-drift cost.

## 2. Inside each Next.js app (`apps/storefront`, `apps/seller`, `apps/admin`)

Adopts the founder's layout. `app/` is **routing only** — pages are thin and
import from `features/`.

```
apps/storefront/
├── package.json           # this app's own deps + scripts
├── .env.example           # every var this app needs, documented
├── README.md              # how to install & run THIS app alone
├── next.config.ts
├── components.json        # shadcn config (points at ../styles/globals.css)
├── messages/              # i18n catalogs — messages/en/<namespace>.json (see `24`)
└── src/
    ├── proxy.ts           # Next middleware — auth gate + locale; stays at src root
    ├── app/               # ROUTING ONLY. pages stay thin, import from features/
    │   ├── layout.tsx     # Server Component (root providers via a client leaf)
    │   ├── [locale]/                      # all routes are locale-scoped (see `24`)
    │   │   ├── (public)/                  # guest-visible, SSR/ISR, indexable
    │   │   │   ├── layout.tsx  loading.tsx  error.tsx  page.tsx
    │   │   │   ├── p/[slug]/{page,loading,not-found}.tsx      # product detail
    │   │   │   ├── c/[...slug]/{page,loading}.tsx             # category browse
    │   │   │   ├── s/[shop]/page.tsx                          # seller storefront
    │   │   │   └── search/page.tsx
    │   │   ├── (shop)/                    # cart/checkout — no-store, not indexed
    │   │   │   ├── cart/page.tsx
    │   │   │   └── checkout/**
    │   │   └── (account)/                 # auth required, no-store
    │   │       ├── layout.tsx             # server-side session gate
    │   │       └── orders/**  profile/**  addresses/**
    │   ├── api/                           # BFF route handlers (compose service calls)
    │   │   ├── public/**/route.ts
    │   │   └── (auth)/**/route.ts
    │   ├── sitemap.ts  robots.ts  manifest.ts
    │   └── not-found.tsx  global-error.tsx
    ├── features/           # DOMAIN CODE: UI + server actions + schema co-located
    │   ├── home/
    │   │   ├── components/      # HeroRail, DealsRail, ForYouRail, CategoryGrid, …
    │   │   └── server/          # candidate/rank helpers used by the page (RSC)
    │   ├── product/
    │   │   ├── components/      # ProductGallery, VariantPicker (leaf 'use client'),
    │   │   │                    #   PriceBlock, AddToCartButton, ReviewsSection, …
    │   │   ├── server/          # getProductView(), getRelated() (RSC data)
    │   │   └── schema.ts        # imported from @shopnetic/contracts, re-exported
    │   ├── cart/
    │   │   ├── components/  actions.ts (server actions)  hooks/  schema.ts
    │   ├── checkout/
    │   ├── search/
    │   └── account/
    ├── components/         # GENERIC, reusable, no domain logic
    │   ├── ui/             # re-exports @shopnetic/ui wrappers (Button, Link, …)
    │   ├── layout/         # StoreHeader, StoreFooter, MegaMenu, MobileNav, BottomBar
    │   ├── common/         # OptimizedImage, LocalizedImage, LoadingSpinner,
    │   │                   #   ErrorBoundary, SkipToContent, EmptyState, Skeletons
    │   └── providers/      # RootProvider (client leaf), ThemeProvider, QueryProvider,
    │                       #   I18nProvider, TokenRefreshProvider
    ├── lib/                # app-local infrastructure (domain-agnostic)
    │   ├── api-client.ts   # typed BFF/client wrapper (from @shopnetic/contracts)
    │   ├── auth-server.ts  auth-client.ts
    │   ├── i18n.ts         # wires @shopnetic/i18n for this app
    │   └── utils/          # cn(), formatMoney (via Intl), slugify
    ├── hooks/              # only truly global hooks (useMediaQuery, useDebounce)
    ├── config/             # site.ts (base paths, cookie names, TTLs read from env),
    │                       #   navigation.ts, seo.ts
    ├── types/              # app-local types (most types come from @shopnetic/contracts)
    └── styles/
        └── globals.css     # Tailwind entry; imports @shopnetic/ui preset
```

### Rules that come with this layout

- **`app/` holds no business logic.** A `page.tsx` fetches via a `features/*/server`
  helper and renders a `features/*/components` component. If a page file is more
  than ~30 lines, move logic into `features/`.
- **`features/` is domain; `components/` is generic.** A component in
  `components/` must not import from `features/`. `features/` may use `components/`.
- **`'use client'` lives only in leaf files** inside `features/*/components` or
  `components/common` (per `CODING-RULES.md` §C). `layout.tsx`, `page.tsx`,
  providers stay server components; the one client provider tree is a single small
  leaf mounted in the root layout.
- **Server actions** co-locate in `features/<domain>/actions.ts`.
- **Schemas** are imported from `@shopnetic/contracts` and re-exported per feature
  so the form and the API can't drift (`CODING-RULES.md` §P1).

## 3. The admin app — obfuscated protected segment

The admin app (`apps/admin`) is on its own subdomain **and** uses an obfuscated
base route segment so the panel isn't guessable from the URL alone (defense in
depth — never the only control; real auth in `proxy.ts` + server layout + API).

```
apps/admin/src/app/[locale]/
├── x7f2k9t3m1qp/                 # admin base segment (value from env: ADMIN_BASE_PATH)
│   ├── layout.tsx                # server: verify staff session or redirect to login
│   ├── login/page.tsx           # the only unauthenticated page here
│   └── (protected)/
│       ├── layout.tsx           # server: require staff grant; load nav by permission
│       ├── page.tsx             # dashboard
│       ├── catalog/**           # products, categories, brands, brand-requests, moderation
│       ├── sellers/**  buyers/**  orders/**  disputes/**  reports/**
│       ├── promotions/**  cms/**  settings/**  staff/**   (staff/** = SUPER_ADMIN)
│       └── ...
└── api/
    └── admin/{login,logout,refresh-token,session-info}/route.ts
```

- `ADMIN_BASE_PATH` is an **env var**, not a literal, so it can be rotated and
  differs per environment. Same idea for the seller app if desired.
- The segment is obfuscation only. Enforcement order: `proxy.ts` (reject
  non-staff, no session → login) → `(protected)/layout.tsx` (server-side grant
  check) → each server action / API route (`authorize()` per `16` §2).
- **One segment for all staff — not one per role.** Super Admin, Admin and
  Service Admin share this base path, one login surface, one `aud=admin` token.
  Differentiation is by **permission-gated route + nav**, computed from the
  actor at request time — e.g. `staff/**` and `config/**` need `staff:manage` /
  `config:manage` (Super Admin only), `disputes/**` needs `dispute:work`.
  Per-role segments would add no security (a leaked `ADMIN` path is as bad as a
  Super Admin one), triple the routing/layouts/i18n/BFF, and can't cover the
  custom staff roles a Super Admin defines at runtime (`03` §2).
- Seller app uses a normal readable path (`/dashboard`, `/products`) — sellers
  are a known audience — but the same three enforcement layers.

## 4. Per-app independence (`package.json` / `.env` / `README` per app)

Each `apps/*` folder has:

| File | Contents |
|------|----------|
| `package.json` | Only that app's runtime deps + its `dev` / `build` / `start` / `test` scripts. Shared packages referenced as `"@shopnetic/ui": "workspace:*"`. |
| `.env.example` | **Every** env var the app reads, grouped, commented, with safe example values. CI checks the running app's `process.env` usage against it. |
| `README.md` | Prereqs, `pnpm install --filter <app>...`, required services (which docker-compose profiles), how to seed, how to run, how to run tests, how to point at staging APIs. A new dev can run just this app. |
| `Dockerfile` | Multi-stage build for this app only. |

Turborepo still gives one-command "run everything" from the root
(`pnpm dev`), affected-only CI, and shared build cache. Running a single app:
`pnpm --filter storefront... dev` (the `...` pulls its workspace deps).

### Env conventions (see also §9 of the founder's list)

- **Config via env, code reads it once** in `src/config/site.ts` (typed, parsed
  with Zod at boot — fail fast on a missing/invalid var).
- Values that belong in env (not hard-coded):
  - `CACHE_TTL_*` — per read-model cache TTLs (`14` gives defaults; env overrides
    per environment).
  - `SESSION_IDLE_TIMEOUT`, `SESSION_ABSOLUTE_TIMEOUT`, `REMEMBER_DEVICE_DAYS` —
    login/device timeouts (`16` §1).
  - `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`.
  - `ADMIN_BASE_PATH`, cookie names/prefixes, cookie domain.
  - Public base URLs, CDN URL, feature-flag SDK key.
  - Rate-limit tier numbers, pagination max, upload size limits.
- **Never** in env / never in the client bundle: DB URLs, provider secret keys,
  JWT signing keys, SMTP creds — those come from the secret manager and only the
  server-side apps (`api`, `workers`) receive them (`16` §3).
- `NEXT_PUBLIC_*` only for values that are genuinely safe in the browser.
- Env files: `.env` (local, gitignored), `.env.example` (committed), real values
  per environment injected by the platform / secret manager (`17` §4).

## 5. Naming & import rules (enforced by ESLint boundaries)

- No deep relative imports (`../../../`). Use `@/` (app src) and `@shopnetic/*`
  (packages) aliases.
- `components/**` may not import `features/**` or `app/**`.
- `features/a/**` may not import `features/b/**` internals — share via
  `components/`, `lib/`, or `@shopnetic/*`.
- `app/**` imports from `features/**` and `components/**`, never the reverse.
- One barrel (`index.ts`) per package boundary; none inside `features/` (avoids
  circular imports + bundle bloat).

## Changelog

- 2026-08-31 — Initial draft. Adopts founder's `app`/`features` split + obfuscated
  admin segment inside the monorepo; per-app package.json/.env.example/README.
