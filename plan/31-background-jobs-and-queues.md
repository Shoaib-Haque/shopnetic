# 31 — Background Jobs & Queues

Status: DRAFT
Related: `02-architecture.md` (section 4), `07-data-model.md` (outbox),
`11-search-and-catalog.md` (section 4), `15-realtime-and-notifications.md`,
`17-infrastructure-devops.md`, `25-database-conventions.md`,
`adr/0003-modular-monolith-first.md`, `CODING-RULES.md` section Q

## 1. Problem this solves

Mail (and anything else external/slow) is currently sent **inline, inside the
request handler** — `await this.mail.sendXxx(...)` in `identity.service.ts`,
`staff-invite.service.ts`, `staff-auth.service.ts`. Three concrete failure
modes fall out of that:

- A slow or unreachable SMTP server blocks the request that triggered it.
- A crash (or just a thrown error) between the DB write committing and the
  mail call completing **loses the email silently** — the account/token
  exists, nothing was ever sent, and there's no record it was supposed to be.
- A burst (e.g. many registrations at once) opens that many concurrent SMTP
  sends with no backpressure — some can simply fail under load with nothing
  retrying them.

`identity.service.ts` already has a `// TODO(outbox): write
identity.account_registered inside this write path.` comment — this doc is
the concrete plan behind that TODO, generalized to every job-shaped piece of
work, not just this one call site.

`02-architecture.md` section 4 already named the pattern in the abstract:

> **Async commands** (queue) — do this reliably, eventually
> (`notification.send`, `payout.execute`, `search.reindex`) — retries + DLQ +
> alert on DLQ depth.

This doc makes that concrete: which queue tech, where it runs, how a job gets
from "something happened" to "reliably processed," and a standing checklist
so a future feature reaches for this without the question being re-asked.

## 2. Decision: BullMQ on the Redis we already run

- Redis is already provisioned (`REDIS_URL`, `apps/api/src/config/env.ts`) —
  reuse it, no new infra to stand up for the first slice.
- **BullMQ**, not:
  - Raw Redis lists — reinvents retries/backoff/DLQ/concurrency by hand.
  - RabbitMQ — a real broker is the right call once a trigger in
    `adr/0003-modular-monolith-first.md` actually fires (a consumer in another
    language, or Realtime/Search genuinely extracting); premature for a
    single Node process talking to itself via Redis.
  - pg-boss — puts job traffic on the primary Postgres instance for no reason
    when Redis is already sitting there unused for this.
  - Cron alone — wrong tool for "process a backlog as it arrives" (see
    section 6).
- Not just named in the plan — `apps/workers` **already exists in the repo**
  as a scaffolded stub (`apps/workers/src/main.ts`: *"Background job
  processors (BullMQ) — payouts, emails, exports, reindex, report rollups,
  retention sweeps... STUB: boots and idles. Queues + processors land as
  features need them."*). This doc is what makes that stub real.

## 3. Where it runs: `apps/api` enqueues, `apps/workers` processes

This is **not** an ADR-0003 extract-on-trigger decision — `apps/workers` is
already its own deployable in the repo today, not a module being carved out
of the monolith. ADR-0003 governs when a *bounded context* (identity,
catalog, payments — each with its own schema and service boundary) earns its
own process; a job-processor process isn't a bounded context, it's a second
consumer of the same Redis the API already talks to. So there's no
extraction step to defer — split by role from the start:

- **`apps/api` is producer-only**: it writes the outbox row / enqueues the
  BullMQ job (section 4) and never processes one itself.
- **`apps/workers` is consumer-only**: it's where the `Worker`/`Queue`
  instances and every processor function actually live. This is the stub's
  entire reason to exist — fill it in, don't route around it.
- `apps/api` already has an `ioredis` connection (`RedisService`, used today
  for rate-limit buckets) — a BullMQ `Queue` (producer side) can reuse that
  connection. `apps/workers` has no Redis dependency yet; add `ioredis` +
  `bullmq` there when the first processor lands. **Don't share one ioredis
  instance between the two roles carelessly**: BullMQ's `Worker` requires
  `maxRetriesPerRequest: null` on its connection for blocking commands to
  work, which conflicts with `RedisService`'s `maxRetriesPerRequest: 2` — give
  the `Worker` its own connection, even if it points at the same Redis.

## 4. The reliability chain: outbox → relay → queue → worker

Concrete version of `02-architecture.md` section 4's outbox pattern, for job
dispatch specifically:

1. The business write and an `outbox` row land in the **same DB transaction**
   (`CODING-RULES.md` Q1/Q3 — no external calls inside the transaction).
2. A relay (poll the outbox table on an interval, or Postgres LISTEN/NOTIFY)
   picks up unpublished rows and enqueues the matching BullMQ job, then marks
   `published_at`.
3. BullMQ owns retries, exponential backoff, and the dead-letter queue from
   there.
4. Every processor is **idempotent** — the job carries the same key a
   re-delivery would carry, so an at-least-once redelivery is a no-op. This
   is the existing inbox/dedupe rule in `02-architecture.md` section 4,
   applied to job processors specifically.

Why not enqueue straight from the request handler and skip the outbox row?
Because that reintroduces exactly the bug this doc exists to fix: if the
process dies between the DB commit and the enqueue call, the job never
existed anywhere. The outbox row is committed atomically with the state
change, so the job survives a crash even before the relay has run.

**Documented, deliberate shortcut for the first slice:** mail is low-stakes
enough (never money; every mail-triggering action — register, forgot-password,
invite — is user-retriggerable) that Phase 0/1 can skip the outbox table and
enqueue directly in the request handler, right after the DB commit, instead
of building the relay first. Leave a `TODO(outbox)` at each such call site
linking back to this doc. **This shortcut does not apply to anything
touching money, stock, or payouts** — those already require the full outbox
from day one per `CODING-RULES.md` Q2–Q5, no exception.

## 5. Job catalog

`apps/workers` is the default home for a new job (general-purpose BullMQ
processors — mail, payouts, exports, report rollups). Check the Notes column
first: a couple of domains already have their own dedicated consumer app
documented elsewhere (search — see below) — don't assume `apps/workers`
without checking.

Grows as features land. Add a row when a new job type ships; don't keep a
second list anywhere else.

| Job | Trigger | Idempotency key | Retry policy | Notes |
|---|---|---|---|---|
| `mail.send` | every `MailService.sendXxx` call (register, resend, invite, forgot-password) | `{type}:{accountId}:{tokenId or similar}` — finalize when built | exponential backoff, ~5 attempts, then DLQ | first slice; see section 8 for today's inline call sites this replaces |
| `search.reindex` | catalog/product write | entity id | backoff, alert on DLQ depth | **not** `apps/workers` — its own dedicated consumer, `apps/search-indexer` (already scaffolded, currently stub), per `11-search-and-catalog.md` section 4 |
| `payout.execute` | payout cycle | payout batch id | backoff + manual review on DLQ (money — no silent drop) | see `13-payments-and-payouts.md`; full outbox required, no shortcut |

## 6. Queue vs. cron — pick correctly

| | Queue (BullMQ) | Cron |
|---|---|---|
| Shape | "process N things reliably as they arrive" | "run this one thing on a schedule" |
| Backlog handling | per-item retry/backoff, bad items isolated to the DLQ | no per-item retry concept |
| Example here | mail send, webhook delivery, reindex | nightly reconciliation, TTL/token cleanup, kicking off a payout cycle |

They compose: a cron trigger can **enqueue** a batch of queue jobs (e.g. "at
02:00, enqueue one `payout.execute` job per seller due") — cron decides
*when*, the queue makes *each item* reliable. Never build a bespoke retry
loop inside a cron job's own code — that's reinventing the queue, worse.

## 7. When to reach for this — checklist

Queue it when the work is:

- An external call in or adjacent to a request path (SMTP, webhook, a
  third-party API, an HIBP-style lookup) that shouldn't block or be able to
  fail the request.
- Fan-out where a burst can exceed synchronous capacity (bulk import, mass
  notification, batch export).
- Safely retriable (idempotent) and not something the caller needs the
  result of before it can respond.

Don't queue: a read; a synchronous validation the caller is blocked on; a
single-table write already inside one transaction with no external side
effect attached (`CODING-RULES.md` Q1).

## 8. Known current violations — retrofit list

Remove a row once its call site is migrated to `mail.send`. Not urgent bugs
today (dev/staging volume is low) — but fix as one slice (build the queue +
migrate every call site together), not ad hoc per call site, so every mail
send gets the same guarantee at the same time.

| Call site | File |
|---|---|
| `sendVerification` (register) | `apps/api/src/identity/identity.service.ts` |
| `sendAlreadyRegistered` | `apps/api/src/identity/identity.service.ts` |
| `sendVerification` (resend) | `apps/api/src/identity/identity.service.ts` |
| `sendStaffInvite` | `apps/api/src/identity/staff-invite.service.ts` |
| `sendStaffPasswordReset` | `apps/api/src/identity/staff-auth.service.ts` |

## Changelog

- 2026-09-15 — Created. Triggered by a direct question about mail delivery
  reliability under load; generalized past mail using `02-architecture.md`
  section 4's already-stated (but not yet concretized) async-commands row.
- 2026-09-15 — Self-review before commit caught that section 3's first draft
  said "run in-process in `apps/api`, extract to `apps/workers` later,"
  reasoning from `adr/0003-modular-monolith-first.md`'s extract-on-trigger
  rule as if a job-processor process were a bounded-context extraction. It
  isn't — `apps/workers` already exists in the repo as a scaffolded stub
  today, so there's no extraction step to defer. Rewrote section 3 to
  producer(`apps/api`)/consumer(`apps/workers`) from the start, and fixed
  the `search.reindex` job-catalog row, which pointed at `apps/workers` but
  actually belongs to `apps/search-indexer` per `11-search-and-catalog.md`
  section 4 — a separate, already-scaffolded dedicated consumer.
