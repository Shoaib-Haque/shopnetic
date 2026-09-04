# Coding Rules

Status: LOCKED (changes require team agreement + a note in the Changelog below)
Applies to: every app and package in the monorepo.
Related: `09-frontend-architecture.md`, `10-seo-strategy.md`, `16-security.md`,
`19-testing-strategy.md`, `08-api-design.md`

This is the contract for *how* we write code on Shopnetic. It is short on purpose.
If a rule and reality conflict, raise it — don't silently ignore it.

---

## A. Process / working agreement

### A1. Ask before you build
Before starting any new feature or non-trivial change, if **anything** is
ambiguous — requirements, edge cases, which existing code to touch, UX,
data shape, naming — **ask first**. A 2-minute question beats a 2-day rebuild.
List your assumptions explicitly and get them confirmed.

### A2. Think the whole flow through before writing code
For every feature (new or altered), write down *before coding*:
- The happy path, step by step, end to end.
- Every **error case** and what the user sees for each.
- Every **corner case** (empty, zero, max, concurrent, slow network, partial
  failure, permission denied, stale data, double submit, back button).
- **Every place that must change** for the full flow to work: DB schema +
  migration, API contract (`@shopnetic/contracts`), service logic, events,
  BFF, frontend, cache invalidation, notifications, admin visibility, tests,
  docs. Nothing downstream should break.

Put this in the PR description. If the list is large, split the PR.

### A3. One change, one purpose
A PR does one thing. No drive-by refactors mixed with features. Refactors get
their own PR so review and rollback stay clean.

### A4. Leave it working
Never merge something that breaks an existing flow. If a change needs a
follow-up to be complete, guard it behind a feature flag (`disabled` by default)
so `main` is always shippable.

### A5. Definition of done
Code + tests (right layer, see `19`) + types clean + lint clean + error/loading/
empty states handled + docs/plan updated + dashboards/alerts if it's a service +
admin can see/moderate it if it's user-facing + PR checklist (section K) ticked.

---

## B. TypeScript

### B1. No `any`. Ever.
`any` disables type checking and *does* cause real bugs. Use:
- `unknown` + a type guard / Zod parse for genuinely unknown input.
- Proper generics for reusable code.
- `as const`, discriminated unions, and exact object types for domain data.
- If you truly must escape the type system, it's `// @ts-expect-error <reason
  + ticket>` on a single line, reviewed, never `any`.

`@typescript-eslint/no-explicit-any` is an **error**, not a warning.

### B2. `strict` everywhere
`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes:
true`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. No per-file opt-outs.

### B3. Types come from one source
Domain / API types are generated from Zod schemas in `@shopnetic/contracts`.
Do **not** hand-write a second copy of an API type in the frontend. Import it.

### B4. Parse at the boundary, trust inside
Every external input (HTTP body, query, params, env vars, message payload,
3rd-party response, `localStorage`) is validated with Zod **at the edge**.
After that boundary the data is typed and trusted — no defensive `?.` soup deep
in the code.

### B5. No type assertions to force a fit
Avoid `as SomeType` except for `as const` and narrowing after a checked guard.
`x as unknown as Y` is banned. If the types don't line up, fix the types.

### B6. Nullish handling is explicit
Use `??` and optional chaining deliberately. Model "no value" as `T | null`
(DB/domain) consistently; don't mix `null` and `undefined` for the same concept.

---

## C. Next.js, Server Components & SEO

> Rationale: we render on the server so crawlers get full HTML and users get
> fast first paint. Marking a high-level file `'use client'` opts its **whole
> subtree** into client rendering and kills that benefit. See `10-seo-strategy.md`.

### C1. `'use client'` only at the leaves
**Never** put `'use client'` in:
- `layout.tsx`, `template.tsx`, `page.tsx`
- providers, context wrappers
- section/container components that render lots of content
- anything that outputs indexable text (product info, descriptions, prices,
  breadcrumbs, reviews)

**Only** put it in small, focused interactive units: a button, a form field, a
menu toggle, an add-to-cart control, a carousel, a quantity stepper. Push the
`'use client'` boundary **as far down the tree as possible**.

### C2. Compose: server shell + client islands
Server Components fetch data and render structure; they pass data as props into
small client components for interactivity. Client components receive
server-rendered `children` where possible (children render on the server even
inside a client parent).

```
// GOOD: page is a Server Component; only the control is client
app/(marketing)/p/[slug]/page.tsx        -> Server Component, fetch + render + JSON-LD
components/product/AddToCartButton.tsx    -> 'use client', tiny
components/ui/Button.tsx                  -> our wrapper (see D)
```

```
// BAD
app/(marketing)/p/[slug]/page.tsx  -> 'use client'   // whole PDP now client-rendered
```

### C3. Data fetching stays on the server
Fetch in Server Components / route handlers / server actions. No fetching primary
content in client `useEffect`. Client data fetching (TanStack Query) is only for
post-load interactive data (cart mutations, live updates, infinite lists behind
a crawlable fallback).

### C4. Every indexable page sets metadata
`generateMetadata` (title, description, canonical, OG), correct `robots`, and
JSON-LD per `10-seo-strategy.md`. CI guards this — don't fight the guard, fix the
page.

### C5. No layout shift, no client-only content on money pages
Reserve space for images/media. Primary content of PDP/category/home is in the
server HTML.

### C6. Server/client boundary is intentional
If you're about to add `'use client'` to make an import work, stop and refactor:
extract the interactive bit into its own leaf component instead.

---

## D. Component architecture & reuse

### D1. Wrapper layer over shadcn
Every shadcn primitive gets a thin project wrapper in `@shopnetic/ui`
(`Button`, `Link`, `Input`, `Dialog`, ...). App code imports **our** wrapper,
never shadcn/Radix directly. The wrapper is where we centralize:
- theme tokens, sizes, variants (via CVA)
- the `'use client'` boundary (so pages stay server components)
- built-in behavior: `Button` handles `loading` (spinner + `disabled` +
  `aria-busy`), `Link` handles pending navigation state, inputs handle error
  display.

### D2. Reuse before you write
Before creating a component/util/hook, search the repo. Extend or generalize
what exists. Duplicated logic (same thing in 2+ places) must be lifted into a
shared module. Copy-paste is a review blocker.

### D3. One way to do a common thing
Money formatting, dates, addresses, ratings, price display, empty states,
error banners, page headers, data tables, pagination, **password fields**
(`@shopnetic/ui` `PasswordInput` — has the show/hide toggle) — **one** shared
component each. No local reinventions.

### D4. Components are dumb about data source
A component takes props; it doesn't know about `fetch`, the BFF, or the store.
Container/server components wire data in. Keeps them testable and reusable.

### D5. Keep components small
If a component file is doing data shaping + layout + 3 interactions + business
rules, split it. Rule of thumb: one component = one responsibility, one screen of
code.

### D6. Naming & structure
- Components `PascalCase`; hooks `useX`; utils `camelCase`; constants
  `SCREAMING_SNAKE`.
- Colocate `Component.tsx` + `Component.test.tsx` + `Component.stories.tsx`.
- No deep relative imports (`../../../`); use workspace aliases.
- Barrel files only at package boundaries, not inside features (avoids circular
  imports + bloated bundles).

---

## E. UX feedback (loading / disabled / pending)

### E1. Every async action shows its state
On click/submit of anything that hits the network:
- disable the trigger (button/link) so it can't be double-fired
- show a spinner or inline pending indicator
- keep the label meaningful ("Placing order…" not just a spinner with no context)
- re-enable and restore on completion (success **or** error)

Our `Button`/`Link` wrappers (D1) do this via a `loading` prop — use it, don't
hand-roll.

### E2. Optimistic UI must roll back visibly
If you update the UI before the server confirms (cart qty, wishlist), on failure
revert the UI **and** show an error toast explaining what happened.

### E3. Prevent double submit at every layer
Disabled button (UX) **and** idempotency key on the request (correctness, see
`08` section 6). Never rely on the disabled button alone.

### E4. Skeletons for first load, spinners for actions
Route/section first load → skeleton matching final layout (no CLS).
User-triggered action → spinner on the control. Don't blank the whole screen for
a background refetch.

### E5. Empty, error, and partial states are required
Every list/section ships all four: loading, empty (with a helpful next step),
error (with retry), and partial (some data failed — show the rest + a notice).
A PR adding a data view without these is incomplete.

---

## F. Error handling & user-facing messages

### F1. Two audiences, two messages
- **User**: plain-language, actionable, no codes, no stack, no jargon.
  "We couldn't reach your saved addresses. Try again in a moment." + retry.
- **Logs/Sentry**: full detail — error, `correlationId`, inputs (PII-redacted),
  stack. The user message carries the `correlationId` in small print so support
  can link them.

### F2. Never leak internals to the UI
No raw exception text, no SQL, no service names, no `undefined is not a
function`, no HTTP 500 body. The frontend maps error `code`s (from the API error
envelope, `08` section 4) to friendly copy via one shared mapper.

### F3. Handle the failure where you can do something about it
Catch to add context, retry, compensate, or convert to a user message — not to
swallow. `catch {}` with no handling is banned. Let it bubble to an error
boundary if the local code genuinely can't recover.

### F4. Error boundaries at sensible seams
`error.tsx` per route segment + `global-error.tsx`. A widget failing (reviews,
recommendations) must not take down the page — wrap it in its own boundary with a
local fallback.

### F5. Distinguish error types
not-found (404 page), unauthorized (redirect to login, keep `returnTo`),
forbidden (explain, don't loop), validation (field-level messages), conflict
(explain what changed, offer reload), rate-limited (say "try again in X"),
network/offline (retry banner), server (generic + correlationId). Don't collapse
them into one "Something went wrong".

### F6. Money/stock/permission checks are server-side, always
Client-side checks are UX hints. The server re-validates price, stock, coupons,
totals, and authorization on every mutation (see `12`, `16`). Never trust a
client-sent price or permission.

### F7. Validation messages are specific
"Enter a valid email" not "Invalid input". "Quantity can't exceed 5 for this
item" not "Error". Reuse the Zod schema's messages between client and server.

---

## G. Design system consistency

### G1. Tokens only — no magic values
Colors, spacing, radii, font sizes, shadows, breakpoints, z-index come from the
shared token set (`@shopnetic/ui`, Tailwind preset). No hex codes, no arbitrary
`p-[13px]`, no one-off font sizes in feature code.

### G2. One visual language across buyer + seller + admin
Same tokens, same components, same interaction patterns everywhere. **Admin/
seller** = denser spacing preset + more utilitarian layout, but identical
colors, typography scale, component behavior, and iconography. It should feel
like the same product.

### G3. Typography & spacing scale
Use the defined type scale and spacing scale. No hand-picked line-heights or
letter-spacing. Headings follow the semantic hierarchy (`h1` once per page, in
order).

### G4. Dark mode & theming via CSS variables
All colors reference CSS custom properties so theming/dark mode work everywhere.
No component hardcodes a light-mode color.

### G5. Icons, copy, and states are consistent
One icon set. Shared copy patterns (button verbs, empty-state tone, error tone).
Loading/disabled/hover/focus styling comes from the wrapper components, not
per-feature CSS.

### G6. Accessibility is part of "consistent"
Every interactive element: keyboard reachable, visible focus ring (token-based),
correct role/label, `aria-busy`/`aria-live` where state changes. Target WCAG 2.2
AA (`20` section 7). Color is never the only signal.

---

## H. API, data & state

### H1. Contract first
Change the Zod schema in `@shopnetic/contracts` → regenerate types/client →
update producers and consumers in the same PR. A breaking API change needs a
version bump (`08` section 2).

### H2. Follow the API conventions
Response envelope, error shape, pagination (cursor), idempotency headers, status
codes — exactly as `08-api-design.md`. No bespoke response shapes.

### H3. State lives in the right place (`09` section 4)
Server cache → RSC/TanStack Query. URL state (filters, tab, page) → `searchParams`.
Ephemeral UI → local state. No global store as a junk drawer. Never duplicate
server data into client state "to be safe".

### H4. Forms
React Hook Form + Zod resolver, schema shared with the API. Disable submit while
pending, show field errors inline, show a form-level error on failure, keep user
input on error.

### H5. No business logic in components or route handlers
Domain rules live in the service/domain layer, unit-tested in isolation. The BFF
composes; components render; handlers validate + delegate.

### H6. Cache changes come with invalidation
If you add a cached read, you add its invalidation trigger in the same PR
(`14-caching-strategy.md`). TTL is a safety net, not the mechanism.

---

## I. Security & privacy (see `16` for the full set)

### I1. Validate and authorize every request server-side
`authorize(actor, permission, resourceContext)` on every mutation + object-level
ownership check. Deny by default.

### I2. Never log secrets or PII
No tokens, passwords, card data, full addresses, KYC contents in logs/traces.
Use the redacting logger; PII fields are allow-listed, not blocked ad hoc.

### I3. No secrets in the repo, bundle, or client
Config via env + secret manager. Nothing sensitive crosses to the browser.
No service URLs or internal identifiers in client code.

### I4. Parameterized queries only
Prisma / query builder. Any `$queryRaw` needs a reviewer sign-off and bound
parameters.

### I5. Escape output; sanitize rich content
No `dangerouslySetInnerHTML` except server-sanitized CMS content through the
shared sanitizer.

---

## J. Tests, comments, commits

### J1. Test at the cheapest useful layer (`19`)
Pure logic → unit. Money/pricing/discount/saga/RBAC modules → near-100% + a
property/edge test for each invariant. Components with logic → RTL. Cross-system
money/trust journeys → a thin Playwright layer. Every bug fix ships a regression
test.

### J2. Tests assert behavior, not implementation
No snapshot-of-markup tests. Test what the user/consumer observes.

### J3. Comments explain *why*
The code says *what*. Comment the non-obvious reason, the edge case, the link to
the ADR/ticket. Delete commented-out code. No `TODO` without a ticket ref.

### J4. Conventional Commits
`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:` … scoped
(`feat(checkout): ...`). Small, reviewable commits. Green CI before merge.

### J5. Keep the plan current
If the change alters, contradicts, or completes anything documented in `plan/` —
a decision, an API contract, a data-model table, a flow, a status tag, or an
open question in `22-risks-and-open-questions.md` — update that file in the
**same PR**. A real decision also gets an ADR (`plan/adr/`). A PR whose code and
`plan/` disagree does not merge: `plan/` is the spec, and code that silently
drifts from it is a bug even when it runs. If the plan is wrong, fix the plan in
the PR — don't leave the contradiction for the next person to discover.

### J6. Keep READMEs and `.env.example` true
Every app and package has a `README.md` (what it is, how to run it, its env
vars, its layout) and every app has a `.env.example`. When a change affects any
of that — a new or renamed env var, a new script, a moved/renamed directory, a
new or changed endpoint, a different port, a new dependency a dev must install —
update the affected `README.md` **and** `.env.example` (every var documented
with a one-line comment; no real secrets) in the same PR. The root `README.md`
covers repo-wide setup and commands; keep it in step too. Stale setup docs cost
every new contributor an hour and erode trust in all the docs.

### J7. Doc notation is spelled out and legended
- Write **"section 4"**, **"section R4"** — not `§`.
- Any doc (plan file, README, long comment) that leans on shorthand symbols or
  short codes — table marks like `✅ / — / ⚠️`, cookie names (`sn_rt` …), SQL
  casts (`$1::uuid`), status tags — carries a **one-line legend at first use**
  in that file (see `03-users-and-rbac.md` top, `26` section 7). Don't make the
  reader reverse-engineer a glyph.
- Cross-references use `` `NN` section M `` (e.g. `` `16` section 4 ``) or the
  full filename; keep them clickable/greppable.

---

## L. Internationalization & copy  (see `24-i18n-localization.md`)

### L1. Zero hard-coded user-visible text
No literal string that a user can see may appear in JSX, a `throw`, a toast, a
`console`-to-UI, an email, a PDF, an `alt`, a `title`, a `placeholder`, an
`aria-label`, a button, a validation message, or an enum label. Every one comes
from a message catalog via `t('namespace.key')`. This includes **error and
validation messages** — the server returns a stable `code` + params, the client
renders `t(errorKey, params)`.

### L2. Only genuinely dynamic data is exempt
Exempt = values that originate as data: a seller's product title, a buyer's
review text, a person's name, a price number, an order id. These are rendered
as-is (or via `Intl` for numbers/dates/currency). Everything structural around
them is translated.

### L3. Keys, not English, are the identifier
`t('cart.item.removedNotice')`, not `t('This item was removed')`. Namespace per
feature (`checkout.*`, `seller.orders.*`). Interpolation and plurals use ICU
MessageFormat (`{count, plural, one {# item} other {# items}}`) — never string
concatenation.

### L4. Missing key = loud in dev, safe in prod
Dev/CI: a missing or unused key fails the build (lint + extract check). Prod:
render a visible fallback and log it — never crash, never show a raw key to the
user in a way that breaks layout.

### L5. Locale comes from the route
All routes are under `/[locale]/…`. Server code reads the request locale; never
read `navigator.language` on the client to pick copy. Formatting (currency,
number, date, relative time, list) goes through the shared `Intl` helpers so it
follows the active locale.

### L6. Seller/admin-authored content is data, translated separately
User-generated catalog/CMS content uses **localized fields** in the DB
(`24` section 5 / `26`), not the UI message catalog. A missing translation for such
content falls back to the default-locale value.

---

## M. Database changes & migrations  (see `25-database-conventions.md`)

### M1. No destructive migration ships with the code that needs it
Every schema change uses **expand → migrate → contract** across separate
deploys: add new (nullable/defaulted) structure → backfill via a job →
switch reads/writes → only in a *later* release drop the old column/table.
A single deploy never both drops a column and depends on its absence.

### M2. Forbidden in a live migration without an explicit, reviewed plan
Dropping/renaming a column or table in use; changing a column type in place;
adding a `NOT NULL` column with no default to a non-empty table; adding a unique
constraint without first verifying no duplicates; a blocking index build on a
large table (use `CREATE INDEX CONCURRENTLY`). Renames are add-copy-drop, never
`RENAME`.

### M3. Every migration is reversible or has a written recovery path
`down` migration where feasible; where not (data transforms), the PR states
exactly how to recover. Migrations are rehearsed on a prod-sized clone and the
lock time is measured and recorded in the PR.

### M4. Backfills are batched, idempotent, resumable jobs
Not inline in the migration. Chunked, rate-limited, safe to re-run, progress
logged.

### M5. Data loss is a release blocker
If a reviewer can construct any sequence of deploy + rollback that loses
committed data, the change does not merge.

---

## N. Data deletion  (see `25-database-conventions.md` section Deletion)

### N1. Default is soft delete
User-facing entities (products, offers, shops, reviews, categories, accounts,
addresses, messages, media) get `deleted_at timestamptz null`. A global Prisma
filter excludes soft-deleted rows; unique indexes are partial
(`… WHERE deleted_at IS NULL`).

### N2. Some records are never hard-deleted
Orders, sub-orders, order lines, invoices, ledger entries, payouts, audit
events, dispute records. Legal/financial retention wins over a delete request —
those are anonymized (PII stripped), not removed (`16` section 7, `20` section 5).

### N3. Every relation declares its delete behavior explicitly
For each FK, decide and document: `RESTRICT` (block delete while children
exist — default for anything financial/historical), `SET NULL` (child survives
without the parent — e.g. product.brand_id when a brand is removed), or
**app-level cascade via events** (soft-delete children in the owning service,
asynchronously). **Database `ON DELETE CASCADE` is banned** on anything crossing
a context boundary or touching money/history.

### N4. Deletion chains are designed before the delete button exists
For each "who can delete what", write the chain: what happens to dependents on
**soft** delete (hidden, kept, reconcilable) and what a **hard** delete (GDPR/
admin purge) touches, step by step, across services via events. Order snapshots
(`07`, `12`) keep history intact when a product/seller is later removed.

### N5. Deletes are authorized, audited, and reason-tagged
Same as any privileged mutation (`16` section 8). Bulk deletes are async jobs with a
per-row result report.

---

## O. Logging  (see `18-observability.md`)

### O1. One structured logger, JSON, no `console.*` in app code
Use `@shopnetic/observability`. `console.log` left in a PR is a review block
(lint-enforced). Logs go to stdout → the aggregator (Loki/Datadog); locally they
also tee to a rotating file so an error can be inspected after the fact.

### O2. Every log line is correlatable
Includes `correlationId`, `traceId`, `service`, `env`, `version`, and the
relevant domain ids (`orderId`, `sellerId` — never PII). A support agent pastes
one id and finds everything.

### O3. Log at the right level, log the decision
`error` = needs a human; `warn` = unexpected but handled; `info` = state
changes and request boundaries; `debug` = off in prod. Log *why* something
happened ("payout skipped: balance below threshold (…)"), not a vague "error
here".

### O4. Errors are logged once, with context, where they're handled
Don't log-and-rethrow at every frame (duplicate noise). Add context and rethrow,
or handle and log — not both repeatedly.

### O5. Never log secrets or PII (restated from I2)
Redacting logger with an allow-list. No request bodies of auth/payment
endpoints. No tokens, passwords, card data, full addresses, KYC contents.

---

## P. Validation & verification  (see `08` section 9, `16` section 4)

### P1. One schema, both sides
The Zod schema for a form/endpoint lives in `@shopnetic/contracts` and is used
by **both** the client (React Hook Form resolver, instant feedback) and the
server (reject at the boundary). They can never drift because there is one copy.

### P2. Client validation is UX; server validation is truth
Never rely on the client. The server re-validates everything — types, ranges,
business rules, ownership, price/stock/coupon recomputation — on every submit,
even if the UI "already checked".

### P3. Verify, don't just validate
Where a value must match reality, check reality server-side before the write:
email/phone ownership (OTP/link), address serviceability, coupon eligibility and
budget, stock availability, seller/product still active, price unchanged since
the user saw it (`29`). "Well-formed" ≠ "true".

### P4. Nothing is posted until it can succeed
Disable submit until the form is valid *and* not already pending. On server
rejection, map field errors back to inputs, keep the user's input, show a
form-level message.

---

## Q. Transactions & atomic writes  (see `25` section Transactions, `12` section 3)

### Q1. A multi-table write is one transaction
If saving a form/action touches 2+ tables **in the same service/database**, wrap
it in a single DB transaction. Partial success (row in table A, table B failed)
is a bug, not an edge case. Roll back the whole thing and return one error.

### Q2. Cross-service "transactions" are sagas, not distributed locks
When the write spans services/databases, use the outbox + saga pattern with
explicit compensation for every step (`02` section 4, `12` section 3). Never a 2-phase commit.

### Q3. Keep transactions short and side-effect-free
No network calls, no queue publishes, no email sends inside a DB transaction.
Do external work *after* commit (via the outbox), so a slow third party can't
hold locks or leave you half-committed.

### Q4. Choose isolation deliberately for money/stock
Stock decrement and coupon redemption use atomic conditional updates or
`SELECT … FOR UPDATE` / `SERIALIZABLE` (`12` section 8). Document the isolation level
and the concurrency argument in the PR.

### Q5. Idempotency alongside atomicity
An action that could be retried carries an idempotency key so a retry after a
partial failure produces one effect, not two (`08` section 6).

---

## R. Configuration & environment

### R1. One validated schema, no scattered `process.env`
Every process reads env through a single Zod schema (`config/env.ts` /
`loadDbEnv` / `server-env.ts`). Feature code never touches `process.env`
directly. Invalid/missing config fails the process at boot with a clear message,
not later at runtime (`B4`).

### R2. Every new/changed var updates `.env.example` **in the same change**
The `.env.example` for that app is the contract. A new var, a rename, a removal,
a changed default → edit `.env.example` (one-line comment each; real secrets
never committed) and the app's README env table in the same PR (`J6`). Say in
the comment which environments need it and any dev-vs-prod difference.

### R3. Behaviour flags default to the safe/production behaviour
A flag that changes how the app behaves is **off** by default and off means
"act like production". Turning it on is an explicit dev choice.

### R4. A dev shortcut that weakens security cannot reach production
If a flag relaxes auth, skips verification, disables a check, seeds test data,
or exposes internals: (a) it is **inert unless `NODE_ENV=development`**;
(b) `loadEnv` **throws at boot** if it is set with `NODE_ENV=production`;
(c) it has **no effect when `NODE_ENV=test`** so CI always exercises the real
path; (d) it is **logged at `warn` on boot** when active. It never changes the
password check, token issuance/verification, RBAC, or plane separation — only
the specific gate it names (e.g. `DEV_AUTH_RELAXED` skips staff TOTP + the
buyer email-verified gate; `DEV_RATE_LIMIT_DISABLED` turns off the `@RateLimit`
guards — nothing else). Note it in `16-security.md`.

### R5. Ports, URLs and hosts are configuration
No hard-coded `localhost:xxxx`, service URL, or DB host in feature code — it
comes from env (`I3`). Local defaults live only in `.env.example` and the
compose file.

---

## K. PR checklist (paste into every PR description)

```
- [ ] A2 done: happy path + error cases + corner cases + full list of files/layers
      touched, written below.
- [ ] Ambiguities raised and resolved (A1). Assumptions listed.
- [ ] No `any`; types clean under strict; API types imported from @shopnetic/contracts.
- [ ] No `'use client'` above leaf level; pages/layouts/providers stay Server Components.
- [ ] Reused existing components/utils; new shared logic lifted, not copy-pasted.
- [ ] Every async control: disabled + spinner + restore on success/error.
- [ ] Loading / empty / error / partial states implemented for every data view.
- [ ] User-facing errors are friendly + mapped from error codes; details go to logs/Sentry.
- [ ] No hard-coded user-visible text — every string via `t()` incl. error/validation messages (L1).
- [ ] Same Zod schema validates on client (UX) and server (truth); server re-verifies against reality (P).
- [ ] Multi-table writes wrapped in one transaction; cross-service via saga + compensation (Q).
- [ ] Schema change follows expand/contract; backfill is a batched job; no data-loss path on deploy+rollback (M).
- [ ] Delete behavior chosen per relation (soft default; no DB CASCADE across contexts); deletion chain written out (N).
- [ ] Server-side validation + authorization + idempotency for every mutation.
- [ ] Structured logger only (no `console.*`); logs correlatable; no PII/secrets (O).
- [ ] Tokens only (no magic colors/sizes); buyer/seller/admin visually consistent.
- [ ] a11y: keyboard, focus ring, roles/labels, aria-busy/live.
- [ ] Tests at the right layer; invariants covered; regression test for any bug fixed.
- [ ] Cache reads have invalidation; contract changes versioned.
- [ ] Admin visibility/moderation + reporting hooks added if user-facing.
- [ ] plan/ docs + ADR updated if a decision, contract, data model, flow, or open question changed (J5).
- [ ] README(s) + .env.example updated for any new/renamed env var, script, moved path, changed port, or new dep (J6).
- [ ] Docs use "section N" (not `§`); any new shorthand symbol/code is legended at first use (J7).
- [ ] New config goes through the validated env schema; behaviour/dev flags are safe-by-default, prod-rejected, test-inert, boot-logged (R).
- [ ] CI green.
```

---

## Changelog

- 2026-08-31 — Initial version. Seeded from the founder's 7 rules (A1, A2, C1,
  E1, F1/F2, B1, G1/G2) plus supporting rules.
- 2026-08-31 — Added L (i18n/copy), M (migrations), N (deletion), O (logging),
  P (validation/verification), Q (transactions), from the founder's second rule
  set. Checklist extended.
- 2026-09-03 — Added R (configuration & environment: validated env schema,
  .env.example discipline, safe-by-default behaviour flags, dev shortcuts that
  cannot reach production). D3 lists PasswordInput. Checklist updated.
- 2026-09-04 — R4 example list gains `DEV_RATE_LIMIT_DISABLED` (dev-only bypass
  of the `@RateLimit` guards, same safeguards).
- 2026-09-04 — Added J7 (doc notation: write "section N" not `§`; every doc
  legends its shorthand at first use). Repo-wide `§` → "section". Role/tier ×
  capability matrices (`03` section 4, `26` section 7) rewritten as ASCII grid
  tables; prose tables stay GFM.
- 2026-09-01 — Strengthened J5 (plan/ kept in lockstep with code, not just for
  "decisions") and added J6 (README.md + .env.example must track code changes).
  Checklist updated.
