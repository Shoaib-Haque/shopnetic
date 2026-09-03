# @shopnetic/storefront

Buyer / guest storefront. Next.js (App Router, RSC/SSR/ISR).

## Run

```bash
docker compose -f ../../infra/docker/docker-compose.yml up -d   # Postgres/Redis/Mailpit
pnpm --filter @shopnetic/api dev                                # identity API on :4000
cp .env.example .env                                            # API_BASE_URL → the API

pnpm --filter @shopnetic/storefront dev     # http://localhost:3000 → /en
pnpm --filter @shopnetic/storefront build
```

## Layout (see `plan/23-project-structure.md`)

- `src/app/` — routing only, thin. `[locale]/(public)` is guest-visible & indexable.
- `src/app/api/auth/*` — **BFF route handlers**: the browser talks to these; they
  call the identity API server-side and own the storefront-scoped `sn_rt`
  httpOnly cookie. The access token never reaches the browser.
- `src/features/<domain>/` — domain UI + actions + schema. `features/auth/` holds
  the forms (client leaves), `api-bridge` (server-only fetch to the identity API),
  `current-actor` (server), and `error-copy` (code → i18n key).
- `src/config/server-env.ts` — zod-validated, `server-only`.
- `src/proxy.ts` — Next 16 middleware (locale; `/api/*` is excluded).
- `messages/en/*.json` — i18n catalogs (`plan/24`): `common`, `auth`. No
  hard-coded user-facing strings, error messages included.

## Auth (buyer)

| Page (`/[locale]/…`)  | What                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `register`            | create account → "check your email"                                 |
| `verify-email?token=` | auto-confirms the emailed token, then links to sign in              |
| `login`               | sign in; on `EMAIL_NOT_VERIFIED` shows an inline "resend link" form |

Home shows a per-viewer `AuthStrip` (client island, keeps the page static) with
sign-in / sign-out. `getCurrentActor()` is the server-side equivalent for
future protected routes.

## Env

| Var                    | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `API_BASE_URL`         | identity/BFF target, server-side only (`:4000`) |
| `NEXT_PUBLIC_SITE_URL` | public origin, safe in the browser              |

## Not yet

Password fields use `@shopnetic/ui` `PasswordInput` (show/hide toggle). Set
`DEV_AUTH_RELAXED=true` on the API in dev to sign in without email verification
(see `apps/api/README.md`).

RTL component tests (only the pure `parse-set-cookie` / `error-copy` helpers are
unit-tested). Password reset. Protected routes / middleware auth gate.
