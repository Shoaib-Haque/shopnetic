# @shopnetic/workers

Background job processors (BullMQ) — `apps/api` enqueues, this process
consumes. Not a staged extraction of the monolith: it's already its own
deployable, split by role from the start
(`plan/31-background-jobs-and-queues.md` section 3).

```bash
pnpm --filter @shopnetic/workers dev    # tsx --watch, loads .env
```

## Queues

| Queue  | Job    | Processor                    | Notes                                                                                                                                                                                               |
| ------ | ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mail` | `send` | `src/mail/mail-processor.ts` | Payload is already-rendered `{ to, subject, text }` — `apps/api`'s `MailService` owns templates/locale, this only does SMTP delivery via nodemailer. Job shape: `@shopnetic/events`' `MailSendJob`. |

Everything else in the header comment of `src/main.ts` (payouts, exports,
reindex\*, report rollups, retention sweeps) — `*` search reindex is actually
`apps/search-indexer`'s own consumer, not this app's, per
`11-search-and-catalog.md` section 4 — lands here as those features are built,
each with its own row in this table and in
`plan/31-background-jobs-and-queues.md` section 5's job catalog.

## Env

`REDIS_URL` (same Redis `apps/api` talks to), `SMTP_URL`, `MAIL_FROM` — see
`.env.example`. Validated once at boot (`src/config/env.ts`); a missing/
invalid var fails startup loudly.

## Tests

```bash
pnpm --filter @shopnetic/workers test
```

Unit only — no DB here. `mail-processor.test.ts` mocks the nodemailer
transporter and asserts the job payload is sent as-is, and that a
transporter failure propagates (so BullMQ's retry actually fires on it).
