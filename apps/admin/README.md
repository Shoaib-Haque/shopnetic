# @shopnetic/admin

Back office. Next.js (App Router). Separate subdomain **and** an obfuscated base
route segment (`ADMIN_BASE_PATH`, default `x7f2k9t3m1qp`).

```bash
docker compose -f ../../infra/docker/docker-compose.yml up -d
pnpm --filter @shopnetic/api dev                 # identity API on :4000
cp .env.example .env
pnpm --filter @shopnetic/admin dev               # http://localhost:3002/en/x7f2k9t3m1qp/login
# the locale root (http://localhost:3002/en) intentionally 404s
```

## Staff auth

**All staff (Super Admin / Admin / Service Admin) use this one URL** —
`http://localhost:3002/en/x7f2k9t3m1qp/login`. There is no per-role path; what a
signed-in staff member can see is decided by their permissions. Staff are
invite-only.

**First sign-in (bootstrap Super Admin):** email + password from
`packages/db/.env` (`BOOTSTRAP_SUPERADMIN_*`, set before `db:seed`). You'll be
shown a **TOTP setup** step — scan the QR with an authenticator app (or enter
the secret manually, behind a "Can't scan?" disclosure), enter the 6-digit
code, save the recovery codes. The pending secret is stable across repeat
login attempts before you confirm — a reload won't invalidate what you just
scanned.
**After that:** email + password → a segmented 6-digit code field (paste
spreads across the cells, typing auto-advances) — or "Use a recovery code
instead" for the one-time alphanumeric fallback.
**Add more staff:** invite from the dashboard (needs `staff:manage` — Super
Admin only); the link (Mailpit) opens `…/x7f2k9t3m1qp/accept-invite`.

The browser only talks to the admin's own `/api/staff-auth/*` route handlers;
they call the identity **staff** API server-side and own a `sn_srt` httpOnly
cookie (8h). No token reaches the browser. Sign-in also stores a short-lived
`sn_sat` access-token cookie the catalog proxy uses (below).

Cookies: **`sn_srt`** = staff refresh token (8h) · **`sn_sat`** = staff access
token (~15m, minted/refreshed by the BFF). Both httpOnly, Path `/`.

**Tests** (`features/staff-auth/components/*.test.tsx`, same RTL harness as
`catalog/categories` — `postJson` + `next/navigation` + `next/link` mocked):
`login-form.test.tsx` covers wrong credentials, the first-login →
TOTP-enrol → recovery-codes → redirect path, the returning-user MFA step
(code re-attached on the retry), network failure showing its distinct copy,
a locked account, and — the security one — the `?next=` open-redirect guard
(off-app URLs and prefix-lookalikes fall back to the dashboard, only genuine
in-root paths are honoured). Also: the `OtpInput` cells reject non-digits and
disable submit until complete, typing auto-advances focus through all 6
cells (a real regression — see CODING-RULES changelog 2026-09-14), the
recovery-code toggle swaps in a plain field, and the enrol screen's QR
renders a genuine PNG data URI (`qrcode`'s encoder runs for real in jsdom, no
canvas needed) with the secret behind a manual-entry fallback.
`accept-invite-form.test.tsx` covers the missing-token guard,
breached/expired-invite copy, and the success/done state. Each verified by
disabling its fix and watching the test fail. `TotpService`'s
reuse-the-pending-secret idempotency is covered server-side, in
`apps/api/src/identity/staff-auth.integration.test.ts`.

## Shell

`(protected)/layout.tsx` (Server Component, session guard) renders
`components/layout/AdminShell` (client): a fixed **topbar** (app name, search
placeholder, account dropdown → sign out), a **collapsible sidebar**
(`components/layout/nav-config.ts`; collapse state in `localStorage`, mobile
drawer, sign-out pinned at its bottom), a scrollable **main column**, and a
**footer**. Only the main column scrolls; the sidebar scrolls on its own.
Toasts: `@shopnetic/ui` `<Toaster/>` is mounted here; call `notify.saved(msg)` /
`notify.error(msg)`.

## Catalog (back office)

`/[locale]/x7f2k9t3m1qp/(protected)/catalog/…` — currently **Categories**
(tree list / create / edit / reparent / delete / restore). On desktop, drag a
row and drop on the top third of another to place it before, the bottom third
for after, the middle to nest inside — one `POST /admin/v1/categories/reorder`
per drop. Reorder, reparent and delete apply immediately and show a **20s Undo**
toast (no confirm); restore keeps its confirm (it names the cascade). Below `md`
there's **no tree** — a flat card list in parent-then-children order, each card
name-only with an **Edit** button; Delete / Restore live inside that Edit modal.
More entities land as follow-up slices.

Categories is the **reference implementation** for these list/tree pages —
patterns to reuse, corner-case log, and backlog are in
`src/features/catalog/categories/README.md`.

Client components call the API through the BFF proxy at **`/api/admin/<path>`**
(`src/app/api/admin/[...path]/route.ts`). The proxy attaches the `sn_sat` Bearer
token and, when it is missing or the API answers `401`, silently refreshes it
from `sn_srt` (which rotates), retries once and writes the new cookies back — so
no token ever reaches the browser. `attribute:manage` / `category:manage` /
`product:manage` on the API decide what actually succeeds.

| Page (`/[locale]/x7f2k9t3m1qp/…`) | What                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `login`                           | email + password → then a TOTP step: enrol (first time, shows secret + otpauth URI, returns recovery codes) or a 6-digit code |
| `accept-invite?token=`            | set a password for an invited staff account                                                                                   |
| `(protected)/…`                   | Server-Component layout: no valid staff session → redirect to `login`                                                         |

Enforcement order (`plan/23` section 3): `src/proxy.ts` → `(protected)/layout.tsx`
server session check → `@RequirePermission` on the API. The obfuscated segment is
defense-in-depth only.

Password fields use `@shopnetic/ui` `PasswordInput` (show/hide toggle). Set
`DEV_AUTH_RELAXED=true` on the API (dev only) to sign in with just email +
password — no TOTP (see `apps/api/README.md`).

## Env

| Var               | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `API_BASE_URL`    | identity API, server-side only (`:4000`)        |
| `ADMIN_BASE_PATH` | must match the `src/app/[locale]/<seg>/` folder |

## Not yet

Nav built from the actor's permissions (all catalog links shown for now, the API
enforces); **staff-invite UI** — `POST /identity/v1/staff/invites` exists
(`staff:manage`, Super Admin) but nothing in the dashboard calls it; sending an
invite is API-only today. The rest of the catalog UI (brands, option types,
value sets, products, media); back-office modules (`plan/06`, Phase 2+).
