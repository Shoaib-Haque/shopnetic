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

`(protected)/staff` (`StaffList`, the directory table) and
`(protected)/staff/invite` (`InviteStaffForm`, email + role,
`staffInviteCreateRequestSchema`) are separate pages, not one page stacked
on top of the other — reached via the **Staff** nav group (see Shell below),
which expands to **List** / **Invite** sub-links. Both need `staff:manage`
(Super Admin only); the group itself is role-gated so a normal Admin never
reaches either page's server-enforced 403 in the first place — the "nav
hides it, API still enforces it" pattern that used to be the whole story
for this page no longer applies here.

**`StaffList`**: one row per staff account (email, role(s), status, TOTP
state), a `⋮` menu per row for the four lifecycle actions:

- **Change role** — opens a small modal, `PATCH :accountId/role` _replaces_
  the account's role (not additive — the old grant is deleted in the same
  transaction as the new one is created).
- **Unlock** / **Reactivate** — same underlying action
  (`POST :accountId/activate`), different button copy depending on how the
  account got non-`active`: offered as "Unlock" when `status: locked`, as
  "Reactivate" when `status: disabled` (a deliberate Deprovision). There's
  no mechanism difference, only in why the account got there, which the UI
  already knows from `status`.
- **Reset authenticator** — only offered when TOTP is actually enrolled;
  clears the secret + recovery codes so the next login re-enrols from
  scratch (the fix for "lost my phone and my recovery codes").
- **Deprovision** — hidden once already `disabled`; `POST
:accountId/deprovision` sets `status: disabled` and revokes every active
  session for the account (belt-and-suspenders — `ActorService` already
  blocks a non-`active` account on its very next request regardless). Also
  available on a `locked` account, letting an admin go straight to
  `disabled` without unlocking first.

The signed-in user's own row is marked "You"; **Change role** and
**Deprovision** are disabled on it — the API rejects both against your own
`accountId` with `409 CANNOT_MODIFY_SELF` (activate/reset-totp have no such
guard: you can't be both authenticated _and_ locked-out-or-disabled, so a
self-guard there would be dead code).

Unlike the other `/api/staff-auth/*` routes these need the _caller's own_
staff session, not a bare refresh-token cookie — `/api/staff-auth/invite`
and the new `/api/staff-auth/staff/[[...path]]` catch-all (list + the four
actions) both go through `proxyWithBearer`
(`features/admin-api/proxy-with-bearer.ts`), the same Bearer-attach-and-
refresh-on-401 dance the `/api/admin/*` proxy uses, shared rather than
duplicated. `callIdentityStaffApi` (`features/admin-api/bridge.ts`) is
`callAdminApi`'s twin, pointed at `identity/v1/staff` instead of `admin/v1`
— these endpoints live in the identity module, not the `admin/v1` API
surface the generic proxy targets. Client-side, `features/admin-api/client.ts`
now exports `staffManageApi` alongside `adminApi` — both are the same
`createApiClient(basePath)` factory (401-redirect handling, `AdminApiError`)
pointed at a different BFF prefix; `redirecting`'s module-level flag stays
shared across both, since a dead session is a dead session regardless of
which proxy noticed first.

Tested in `invite-staff-form.test.tsx` (invalid email, success, error paths)
and `staff-list.test.tsx` (load error + retry, rendering, the self-row
guard, each action's visibility rule and full flow, mapped error copy on
failure — including that a locked row offers only "Unlock" and a disabled
row offers only "Reactivate", never both). `staff-accounts.service.
integration.test.ts` covers the API side against a real DB:
role-replace-not-add, both self-guards, `activate`'s already-active
rejection, activating a locked account, **reactivating a deprovisioned
(disabled) account** (the regression test for the "deprovision has no way
back" bug), TOTP reset actually clearing rows, deprovision revoking
sessions, and the 404 on a non-staff account. One jsdom gotcha
worth knowing for any future Radix-menu test: `fireEvent.click` on a
`DropdownMenuTrigger` silently does nothing — Radix opens it on
`pointerdown` (or Enter/Space/ArrowDown), which jsdom's plain click never
fires; `vitest.setup.ts` also gained pointer-capture polyfills Radix needs
that jsdom doesn't implement at all.

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
The **Staff** entry is the first (only, so far) item marked
`superAdminOnly` — a normal Admin never sees it in the nav; the API's
`@RequirePermission(STAFF_MANAGE)` was already the real gate, this closes
the UX gap where they could see and submit a form that only then rejected
them. Tested in `nav-config.test.ts` (the pure filter: drops the section,
keeps it for a multi-role account that includes `SUPER_ADMIN`, never
touches sections with no gated items) and `admin-shell.test.tsx` (the
real `Sidebar` wiring: Super Admin sees the "Staff" group + the
"Administration" heading, a normal Admin sees neither).

**Staff is a nav group, not a single link.** `nav-config.ts`'s `NavItem` can
carry `children: NavChildItem[]` instead of a `path` — one level only, a
child is always a plain link, and gating stays on the parent since every
child shares one permission today. Clicking the group toggles it open to
reveal **List** (`/staff`) and **Invite** (`/staff/invite`); expand state
(`expandedGroups`, keyed by `NavItem.key`) lives in `useSidebar()` rather
than in `Sidebar` itself, because the desktop rail and the mobile drawer
mount two separate copies of the sidebar body that need to stay in sync.
Being on a child route auto-expands the group even without a click
(`expanded || anyChildActive`). On the collapsed desktop rail there's no
room for an indented submenu, so the group's icon links straight to its
first child (List) instead of a flyout. Active-link matching
(`isActiveHref`) is a `pathname.startsWith(href)` prefix check, which means
a parent path like `/staff` is technically a prefix of `/staff/invite` too
— `NavItemRow` picks the **longest** matching child path as the sole
"current" one so only one sub-link is ever marked `aria-current`, not
every ancestor along the way.

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
permission, the API still enforces) — only the Staff nav group is
role-aware so far (see Shell above). The rest of the catalog UI (brands,
option types, value sets, products, media); back-office modules (`plan/06`,
Phase 2+).
