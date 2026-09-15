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
**Add more staff:** invite from the dashboard's **Staff** page (needs
`staff:manage` — Super Admin only, see below); the link opens
`…/x7f2k9t3m1qp/accept-invite`. Mail goes through `apps/api`'s
`SMTP_URL`/`MAIL_FROM` (its own README's Env table) — Mailpit by default,
real delivery if those are pointed at a real SMTP account.

**`login` and `accept-invite` are public-only:** `redirectIfSignedIn`
(`features/staff-auth/redirect-if-signed-in.ts`) sends an already-signed-in
visitor straight to the dashboard instead of showing either page. This
matters most for `accept-invite` — the session cookie is shared across every
tab in a browser, not per-tab, so opening an invite link in the same browser
that sent it (the common case) would otherwise silently accept the invite
_and_ swap that browser's session over to the new account. Any future
public-only page (forgot-password, …) should call the same helper rather
than re-deriving the check.

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
canvas needed) with the secret behind a manual-entry fallback. Error-copy
coverage: a rate-limited attempt, a wrong authenticator code, a wrong
recovery code (each stays on its own step rather than bouncing back), and
confirming enrolment after the account got enrolled elsewhere
(`MFA_ALREADY_ENROLLED`). `accept-invite-form.test.tsx` covers the
missing-token guard, breached/expired-invite copy, and the success/done
state — on success it auto-redirects to `login` after a 3s
`REDIRECT_DELAY_MS` (fake timers: not before, exactly at), no manual
"Go to sign in" link, and shows a `@shopnetic/ui` `TimerBar` (the same
shrinking-bar primitive `notify.*` toasts use) so the wait reads as
self-resolving rather than a dead pause. `redirect-if-signed-in.test.ts`
covers `redirectIfSignedIn` directly (redirects when signed in, no-ops
when not) — one unit test standing in for both `login` and `accept-invite`,
since they share the exact same call. Each verified by disabling its fix
and watching the test fail.
`TotpService`'s reuse-the-pending-secret idempotency is covered
server-side, in `apps/api/src/identity/staff-auth.integration.test.ts`.
`(protected)/layout.test.tsx` covers the session guard directly: no
session redirects to that locale/root's login and never renders the
shell, a valid session renders it with no redirect.

## Staff management

`(protected)/staff` — `InviteStaffForm` (email + role, `staffInviteCreateRequestSchema`):
Send invite calls `identity/v1/staff/invites` (`staff:manage`, Super Admin
only), 202 toasts "Invite sent to \<email\>." and clears the email field
(the chosen role sticks, since inviting several people to the same role in a
row is the common case). Nav shows the page to everyone — same "API
enforces" convention as Catalog below — a non-Super-Admin gets `FORBIDDEN`
back and sees "Only a Super Admin can do that."

Unlike the other `/api/staff-auth/*` routes this one needs the _caller's own_
staff session, not a bare refresh-token cookie: `/api/staff-auth/invite`
goes through `proxyWithBearer` (`features/admin-api/proxy-with-bearer.ts`) —
the same Bearer-attach-and-refresh-on-401 dance the `/api/admin/*` proxy
uses, now shared by both rather than duplicated. `callIdentityStaffApi`
(`features/admin-api/bridge.ts`) is `callAdminApi`'s twin, pointed at
`identity/v1/staff` instead of `admin/v1` — the invite endpoint lives in the
identity module, not the `admin/v1` API surface the generic proxy targets.

Tested in `invite-staff-form.test.tsx`: invalid email, success (toast copy,
role carried in the request, email-only reset), `INVITE_EMAIL_TAKEN`,
`FORBIDDEN`, and a network failure. Verified end-to-end against a running
stack too: real Super Admin login, page render, a sent invite landing in
Mailpit, and both the email-taken and BFF-side validation error responses.

## Shell

`(protected)/layout.tsx` (Server Component, session guard) renders
`components/layout/AdminShell` (client): a fixed **topbar** (app name, search
placeholder, account dropdown → sign out), a **collapsible sidebar**
(`components/layout/nav-config.ts`; collapse state in `localStorage`, mobile
drawer, sign-out pinned at its bottom), a scrollable **main column**, and a
**footer**. Only the main column scrolls; the sidebar scrolls on its own.
Toasts: `@shopnetic/ui` `<Toaster/>` is mounted here; call `notify.saved(msg)` /
`notify.error(msg)`.

**Sign-out** lives once, in `AdminShell`'s `signOut()` — Topbar and Sidebar
both call it via props, neither has its own copy (D2). It checks the logout
call's result: on failure (offline — the BFF route always clears cookies and
returns ok even when the upstream call itself failed, so a network error
reaching the browser is the only real failure signal) it resets the button
and shows a toast, instead of navigating to `/login` anyway — which would
otherwise just bounce straight back to the dashboard via the login page's own
already-signed-in guard, with nothing explaining why "sign out" didn't work.
Tested in `admin-shell.test.tsx`: success navigates + refreshes, failure
toasts and re-enables the button, a second click while pending is a no-op.
(`features/staff-auth/components/logout-button.tsx` was a separate,
never-wired-in implementation of the same thing — deleted as dead code.)

**Nav is role-aware.** `/auth/session` now returns `roles` on `SessionUser`
(the account's distinct role keys, e.g. `['SUPER_ADMIN']` — staff plane
only, computed from `Grant`/`Role`, not trusted by the API itself) —
`(protected)/layout.tsx` passes it through to `AdminShell` → `Sidebar`.
`nav-config.ts`'s `visibleNavSections(roles)` drops any `superAdminOnly`
item for a non-Super-Admin, and drops a section entirely once it has no
visible items left (so "Administration" doesn't show as an empty heading).
The **Staff** page is the first (only, so far) item marked
`superAdminOnly` — a normal Admin never sees it in the nav; the API's
`@RequirePermission(STAFF_MANAGE)` was already the real gate, this closes
the UX gap where they could see and submit a form that only then rejected
them. Tested in `nav-config.test.ts` (the pure filter: drops the section,
keeps it for a multi-role account that includes `SUPER_ADMIN`, never
touches sections with no gated items) and `admin-shell.test.tsx` (the
real `Sidebar` wiring: Super Admin sees "Invite staff" + the
"Administration" heading, a normal Admin sees neither).

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

Catalog nav isn't role-gated yet (all catalog links shown regardless of
permission, the API still enforces) — only the Staff-management link is
role-aware so far (see Shell above). The rest of the catalog UI (brands,
option types, value sets, products, media); back-office modules (`plan/06`,
Phase 2+).
