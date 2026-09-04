# @shopnetic/api

Shopnetic backend — NestJS **modular monolith** (`plan/adr/0003-modular-monolith-first.md`).
Each bounded context is a Nest module with its own Postgres schema.

## Run

```bash
docker compose -f ../../infra/docker/docker-compose.yml up -d   # Postgres :5433, Redis :6380, Mailpit :8025
cp .env.example .env
pnpm --filter @shopnetic/db db:migrate                          # first time / after schema changes

pnpm --filter @shopnetic/api dev      # tsx watch, http://localhost:4000
pnpm --filter @shopnetic/api build
pnpm --filter @shopnetic/api start
```

`dev` / `start` load `.env` if present (`--env-file-if-exists`).

## Endpoints

| Method         | Path                                                                      | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET            | `/healthz`                                                                | liveness — process is up (no dependency checks)                                                               |
| GET            | `/readyz`                                                                 | readiness — `200` when the DB answers, `503` otherwise                                                        |
| GET            | `/.well-known/jwks.json`                                                  | public keys for verifying access tokens                                                                       |
| POST           | `/identity/v1/auth/register`                                              | `{ email, password }` → always `202` (no account enumeration)                                                 |
| POST           | `/identity/v1/auth/verify`                                                | `{ token }` → marks the email verified                                                                        |
| POST           | `/identity/v1/auth/verification/resend`                                   | `{ email }` → always `202`                                                                                    |
| POST           | `/identity/v1/auth/login`                                                 | `{ email, password }` → sets `sn_rt` httpOnly cookie + access token; `403 EMAIL_NOT_VERIFIED` until verified  |
| POST           | `/identity/v1/auth/token/refresh`                                         | rotates the refresh cookie; reuse → `401` + family revoked                                                    |
| POST           | `/identity/v1/auth/logout`                                                | revokes the session, clears the cookie, `204`                                                                 |
| GET            | `/identity/v1/auth/session`                                               | current user for a valid refresh cookie (no rotation); `401` if not signed in                                 |
| GET            | `/identity/v1/me`                                                         | **Bearer** — the actor: plane, grants, flattened permissions                                                  |
| GET            | `/identity/v1/audit-events`                                               | **Bearer** + `auditlog:read` — newest-first, cursor-paginated (`?cursor=&limit=`)                             |
| POST           | `/identity/v1/staff/auth/login`                                           | `{ email, password, code? }` → TOTP enrolment challenge (first time) or `sn_srt` cookie + `aud=admin` token   |
| POST           | `/identity/v1/staff/auth/totp/confirm`                                    | `{ email, password, code }` → confirms the authenticator, returns recovery codes + a session                  |
| POST           | `/identity/v1/staff/auth/token/refresh`                                   | rotates `sn_srt` (8h lifetime)                                                                                |
| POST           | `/identity/v1/staff/auth/logout`                                          | `204`                                                                                                         |
| GET            | `/identity/v1/staff/auth/session`                                         | current staff user for a valid `sn_srt` cookie                                                                |
| POST           | `/identity/v1/staff/invites`                                              | **staff Bearer** + `staff:manage` — `{ email, role }` → emails an invite link, `202`                          |
| POST           | `/identity/v1/staff/invites/accept`                                       | `{ token, password }` → creates the staff account, `202`                                                      |
| \*             | `/admin/v1/categories` (+ `…/:id`, `…/:id/move`)                          | **staff Bearer** + `category:manage` — category tree CRUD (ltree `path`, reparent, soft-delete)               |
| GET/PUT/DELETE | `/admin/v1/categories/:categoryId/options[/:optionTypeId]`                | **staff Bearer** + `category:manage` — per-category option config (applicability, variant-axis, value source) |
| \*             | `/admin/v1/brands` (+ `…/:id`, `…/:id/aliases[/:aliasId]`, `…/:id/merge`) | **staff Bearer** + `brand:manage` — brand CRUD, aliases, merge (moves aliases, soft-deletes source)           |
| \*             | `/admin/v1/option-types` (+ `…/:id`, `…/:id/values[/:valueId]`)           | **staff Bearer** + `attribute:manage` — global option-type + option-value catalog (Color, Size, Storage…)     |
| \*             | `/admin/v1/value-sets` (+ `…/:id`, `…/:id/items[/:optionValueId]`)        | **staff Bearer** + `attribute:manage` — managed value lists ("Apparel sizes"); backs `predefined`/`hybrid`    |
| \*             | `/admin/v1/products` (+ `…/:id`)                                          | **staff Bearer** + `product:manage` — base product CRUD (category fixed, brand checked vs category rule)      |
| GET/PUT/DELETE | `/admin/v1/products/:productId/options/:optionTypeId` (+ `/values`)       | **staff Bearer** + `product:manage` — which option types the product uses + the values it offers per axis     |
| \*             | `/admin/v1/products/:productId/variants` (+ `…/:id`)                      | **staff Bearer** + `product:manage` — variant (SKU) CRUD; selections = one value per variant-axis option      |
| GET/POST       | `/admin/v1/products/:productId/media`                                     | **staff Bearer** + `product:manage` — a product's photos/videos (`product`-owned only for now)                |
| \*             | `/admin/v1/media/:id` (+ `…/tags/:optionTypeId`)                          | **staff Bearer** + `product:manage` — media metadata/status + option-value tags (per-variant gallery)         |

Responses use the envelope from `@shopnetic/contracts` (`{ data, meta }` /
`{ error }`, RFC-9457). Auth routes are per-IP rate limited (`X-RateLimit-*`,
`429` + `Retry-After`). Protected routes need `Authorization: Bearer <access-jwt>`.
`AuthGuard` covers the storefront (`aud=storefront`); `StaffAuthGuard` covers the
admin API (`aud=admin` and `plane=staff`). Both load the `Actor`, then
`@RequirePermission` + `PermissionGuard` enforce permissions (`403` on denial).
The `Actor` is rebuilt from the DB per request, and a token is only ever valid
for its own plane.

### Try it

```bash
curl -sX POST localhost:4000/identity/v1/auth/register \
  -H 'content-type: application/json' -d '{"email":"a@b.com","password":"hunter2xyz"}'
# open http://localhost:8025 → copy the token from the email → :
curl -sX POST localhost:4000/identity/v1/auth/verify \
  -H 'content-type: application/json' -d '{"token":"<paste>"}'
curl -isX POST localhost:4000/identity/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"a@b.com","password":"hunter2xyz"}'  # note Set-Cookie
```

## Structure

```
src/
  config/    zod-validated env (loadApiEnv) + @Global ConfigModule
  common/    AppError + RFC-9457 exception filter, Zod body pipe, correlation-id
             middleware, Redis rate-limit guard/decorator, success envelope
  redis/     @Global RedisModule (ioredis)
  crypto/    @Global CryptoModule — JwksService (RS256 sign + verify) + /.well-known/jwks.json
  auth/      @Global AuthModule — ActorService, AuthGuard, @RequirePermission +
             PermissionGuard, @CurrentActor
  audit/     @Global AuditModule — AuditService (append-only identity.audit_event)
  prisma/    PrismaService (extends the @shopnetic/db client) + @Global PrismaModule
  catalog/   CatalogModule — Category / Brand / OptionType / ValueSet /
             CategoryOption services (see the endpoint table) + ProductService
             (/admin/v1/products) + ProductOptionService (product option config +
             offered values) + VariantService (SKUs, combo signature) +
             MediaService (product photos/videos + option-value tags); shared
             catalog outbox helper. `offer` (price + stock) and offer-owned
             media are the inventory context, not built.
  identity/  IdentityModule — buyer + staff auth. register/verify/login/refresh/
             logout/session, /me, /audit-events; staff invite + accept, staff
             login + TOTP enrol/confirm; password, sessions (rotation + reuse
             detection), TOTP (otplib + AES-256-GCM seed), email verification,
             transactional mail (Mailpit)
  health/    health controller
  main.ts    parses env, wires cookie-parser + the global filter, boots Nest
```

## Tests

```bash
pnpm --filter @shopnetic/api test              # unit (no DB) — runs in `turbo test`
pnpm --filter @shopnetic/api test:integration  # *.integration.test.ts — needs DATABASE_URL
```

Integration specs run against a migrated + seeded Postgres (CI provides one; the
`integration` job in `.github/workflows/ci.yml`). They create `itest-*` accounts
and clean up after themselves.

## Env

Everything goes through the validated schema in `src/config/env.ts`
(CODING-RULES §R). See `.env.example` — each var carries a comment and any
dev-vs-prod difference. Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_ISSUER`,
`JWT_ACCESS_TTL_SECONDS`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (dev: omit for an
ephemeral pair; prod: required), `AUTH_REFRESH_TTL_DAYS`,
`AUTH_STAFF_REFRESH_TTL_HOURS`, `VERIFICATION_TTL_HOURS`, `TOTP_ENC_KEY` (dev may
omit; prod required), `TOTP_ISSUER`, `TOTP_WINDOW_STEPS` (skew tolerance,
default 1), `SMTP_URL`, `MAIL_FROM`, `APP_WEB_URL`, `ADMIN_WEB_URL`,
`ADMIN_BASE_PATH`, `PASSWORD_BREACH_CHECK`.

### Dev shortcuts

`DEV_AUTH_RELAXED=true` (development only) skips staff TOTP and the buyer
email-verified gate — sign in with email + password alone. It is **rejected at
boot in production** and **ignored under `NODE_ENV=test`** so integration tests
always run the real flow. Flip it to `false` to test like production. Password,
tokens, RBAC and plane separation are unchanged either way.

`DEV_RATE_LIMIT_DISABLED=true` (development only) turns off **every** `@RateLimit`
guard so repeated local login/refresh attempts aren't throttled. Same
safeguards: rejected at boot in production, no effect under `NODE_ENV=test`,
logged at `warn` on boot.

## Not yet

Step-up re-auth for sensitive staff actions. Outbox writes + a dispatcher.
Auto-audit interceptor (audit is explicit calls for now). Short-lived `Actor`
cache. Object-level `404`-masking helpers.
