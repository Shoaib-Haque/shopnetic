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
shown a **TOTP setup** step — add the secret to an authenticator app (manual key
entry), enter the 6-digit code, save the recovery codes.
**After that:** email + password → 6-digit code (or a one-time recovery code).
**Add more staff:** invite from the dashboard (needs `staff:manage` — Super
Admin only); the link (Mailpit) opens `…/x7f2k9t3m1qp/accept-invite`.

The browser only talks to the admin's own `/api/staff-auth/*` route handlers;
they call the identity **staff** API server-side and own a `sn_srt` httpOnly
cookie (8h). No token reaches the browser. Sign-in also stores a short-lived
`sn_sat` access-token cookie the catalog proxy uses (below).

## Catalog (back office)

`/[locale]/x7f2k9t3m1qp/(protected)/catalog/…` — currently **Categories**
(list / create / edit / reparent / delete). More entities land as follow-up
slices.

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

Enforcement order (`plan/23` §3): `src/proxy.ts` → `(protected)/layout.tsx`
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
enforces); QR image for enrolment (secret + otpauth URI shown as text for now);
the rest of the catalog UI (brands, option types, value sets, products, media);
back-office modules (`plan/06`, Phase 2+).
