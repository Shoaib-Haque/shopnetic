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

| Method | Path                                    | Purpose                                                                                                      |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/healthz`                              | liveness — process is up (no dependency checks)                                                              |
| GET    | `/readyz`                               | readiness — `200` when the DB answers, `503` otherwise                                                       |
| GET    | `/.well-known/jwks.json`                | public keys for verifying access tokens                                                                      |
| POST   | `/identity/v1/auth/register`            | `{ email, password }` → always `202` (no account enumeration)                                                |
| POST   | `/identity/v1/auth/verify`              | `{ token }` → marks the email verified                                                                       |
| POST   | `/identity/v1/auth/verification/resend` | `{ email }` → always `202`                                                                                   |
| POST   | `/identity/v1/auth/login`               | `{ email, password }` → sets `sn_rt` httpOnly cookie + access token; `403 EMAIL_NOT_VERIFIED` until verified |
| POST   | `/identity/v1/auth/token/refresh`       | rotates the refresh cookie; reuse → `401` + family revoked                                                   |
| POST   | `/identity/v1/auth/logout`              | revokes the session, clears the cookie, `204`                                                                |
| GET    | `/identity/v1/auth/session`             | current user for a valid refresh cookie (no rotation); `401` if not signed in                                |
| GET    | `/identity/v1/me`                       | **Bearer** — the actor: plane, grants, flattened permissions                                                 |
| GET    | `/identity/v1/audit-events`             | **Bearer** + `auditlog:read` — newest-first, cursor-paginated (`?cursor=&limit=`)                            |

Responses use the envelope from `@shopnetic/contracts` (`{ data, meta }` /
`{ error }`, RFC-9457). Auth routes are per-IP rate limited (`X-RateLimit-*`,
`429` + `Retry-After`). Protected routes need `Authorization: Bearer <access-jwt>`;
`AuthGuard` verifies it and `@RequirePermission` + `PermissionGuard` enforce
permissions (`403` on denial). The `Actor` is rebuilt from the DB per request.

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
  identity/  IdentityModule — register/verify/login/refresh/logout/session,
             /me, /audit-events, password, sessions (rotation + reuse detection),
             email verification, transactional mail (Mailpit)
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

See `.env.example`. Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_ISSUER`,
`JWT_ACCESS_TTL_SECONDS`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (dev: omit for an
ephemeral pair; prod: required), `AUTH_REFRESH_TTL_DAYS`, `VERIFICATION_TTL_HOURS`,
`SMTP_URL`, `MAIL_FROM`, `APP_WEB_URL`, `PASSWORD_BREACH_CHECK`.

## Not yet

Outbox writes on register (event publishing). Staff-plane auth (separate login
surface, `aud=admin`, TOTP). Auto-audit interceptor (audit is explicit calls for
now). Short-lived `Actor` cache. Object-level `404`-masking helpers.
