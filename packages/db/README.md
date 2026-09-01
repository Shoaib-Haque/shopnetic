# @shopnetic/db

Prisma schema + generated client + the client singleton. One schema file, models
grouped by bounded context, each context in its own Postgres schema
(`@@schema(...)`) — `plan/02-architecture.md` §5, `plan/07-data-model.md`.

Evolution rules: **`plan/25-database-conventions.md`** — expand/contract
migrations, soft-delete by default, explicit FK behaviour, short transactions.

STUB — no models yet. `getPrismaClient()` throws. Next Phase 0 PR adds the
`identity` models, runs `prisma generate`, and wires the real singleton.
