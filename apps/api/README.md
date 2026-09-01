# @shopnetic/api

Shopnetic backend — NestJS **modular monolith** (`plan/adr/0003-modular-monolith-first.md`).
Each bounded context is a Nest module with its own Postgres schema.

## Run

```bash
pnpm --filter @shopnetic/api dev      # tsx watch, http://localhost:4000
pnpm --filter @shopnetic/api build
pnpm --filter @shopnetic/api start
```

## Endpoints (skeleton)

| Method | Path       | Purpose                                       |
| ------ | ---------- | --------------------------------------------- |
| GET    | `/healthz` | liveness                                      |
| GET    | `/readyz`  | readiness (stub — always ok until deps wired) |

Copy `.env.example` → `.env`. Config is parsed/validated at boot in a later PR.
