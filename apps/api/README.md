# @shopnetic/api

Shopnetic backend — NestJS **modular monolith** (`plan/adr/0003-modular-monolith-first.md`).
Each bounded context is a Nest module with its own Postgres schema.

## Run

```bash
docker compose -f ../../infra/docker/docker-compose.yml up -d   # Postgres on :5433
cp .env.example .env
pnpm --filter @shopnetic/db db:migrate                          # first time / after schema changes

pnpm --filter @shopnetic/api dev      # tsx watch, http://localhost:4000
pnpm --filter @shopnetic/api build
pnpm --filter @shopnetic/api start
```

`dev` / `start` load `.env` if present (`--env-file-if-exists`).

## Endpoints

| Method | Path       | Purpose                                                           |
| ------ | ---------- | ----------------------------------------------------------------- |
| GET    | `/healthz` | liveness — process is up (no dependency checks)                   |
| GET    | `/readyz`  | readiness — `200` when the DB answers `SELECT 1`, `503` otherwise |

## Structure

```
src/
  config/    zod-validated env (loadApiEnv) + @Global ConfigModule
  prisma/    PrismaService (extends the @shopnetic/db client) + @Global PrismaModule
  health/    health controller
  app.module.ts
  main.ts    parses env, then boots Nest
```

## Env

| Var            | Default       | Purpose                                 |
| -------------- | ------------- | --------------------------------------- |
| `NODE_ENV`     | `development` | `development` \| `test` \| `production` |
| `PORT`         | `4000`        | HTTP port                               |
| `DATABASE_URL` | —             | Postgres connection string (required)   |
| `APP_VERSION`  | `0.0.0`       | reported by `/healthz` and `/readyz`    |
