# 03 — Users & RBAC

Status: IN PROGRESS (Phase 0 Implemented: Buyer Auth, Staff Auth & RBAC)
Related: `16-security.md`, `06-features-admin.md`, `04-features-buyer.md`

> **Build progress:**
>
> - **Buyer Auth (Phase 0 — Built):** Registration, verification email via Mailpit, login, refresh token rotation (`sn_rt`), logout, current account lookup. Tested in `apps/storefront` and `apps/api`. Detailed in `04-features-buyer.md`.
> - **Staff Auth & RBAC (Phase 0 — Built):** Invite-only onboarding, mandatory TOTP MFA with recovery codes, staff session rotation (`sn_srt` / `sn_sat`), fine-grained RBAC (`packages/auth`), and append-only audit logs. Tested in `apps/admin` and `apps/api`. Detailed in `06-features-admin.md`.
> - **Dual-Plane Separation (Phase 0 — Built):** Strict boundary between marketplace (`plane: marketplace`) and staff (`plane: staff`). Cross-plane token usage returns `401 Unauthorized`.
> - **Seller Portal Auth (Phase 1 — In Progress):** Shared marketplace plane auth; seller onboarding & verification pending.

Legend — in the tables below: **✅** = allowed / applies · **—** = not
applicable / not allowed · **⚠️** = allowed with a caveat (noted in the row).
Cookie names: **`sn_rt`** = buyer refresh token · **`sn_srt`** = staff refresh
token · **`sn_sat`** = staff access token (all httpOnly; see `16-security.md`).

## 1. Actor model

Two account "planes" that must stay separate:

- **Marketplace plane**: Guest, Buyer, Seller. Self-service signup. Lives in the
  storefront domain.
- **Staff plane**: Service Admin, Admin, Super Admin. **Invite-only**, created by
  a higher tier, separate login surface (`admin.` subdomain), mandatory 2FA,
  IP allow-list optional.

A single human may hold a Buyer account *and* a Seller account (same login,
multiple role grants) — but a staff account is always a distinct account. Never
let a storefront token authenticate against the admin API.

**Implemented (staff plane):** endpoints under `/identity/v1/staff/*`; access
tokens carry `aud=admin`; `StaffAuthGuard` requires `aud=admin` **and**
`plane=staff` (a storefront token gets `401` there, and an admin token gets
`401` on storefront routes). Onboarding is invite-only: `POST
/identity/v1/staff/invites` (needs `staff:manage` — Super Admin only) emails a
link to `${ADMIN_WEB_URL}/…/accept-invite?token=`; `POST
…/staff/invites/accept` `{ token, password }` creates the `staff` account +
credential + global grant (email counts as verified — the link proved control).
The invited address must not already exist as any account.

## 2. Model: roles + permissions + scopes

We use **RBAC with fine-grained permissions**, not hard-coded role checks in
business logic.

- **Permission** = a verb on a resource: `product:update`, `coupon:create`,
  `payout:approve`, `admin:manage`, `report:resolve`.
- **Role** = a named bundle of permissions (`SELLER`, `SERVICE_ADMIN`,
  `ADMIN`, `SUPER_ADMIN`, plus custom staff roles a Super Admin defines).
- **Scope** = the data boundary a grant applies to:
  - `seller:{sellerId}` — a seller only touches their own shop/products/orders.
  - `global` — platform-wide (staff).
  - `self` — a buyer only touches their own cart/orders/profile.
- A **grant** = (account, role, scope). One account can have several grants.

Business code checks `can(actor, 'product:update', { sellerId })` — a single
authorization helper — never `if (actor.role === 'ADMIN')`.

### Why this way

- Super Admin can create a new staff role ("Catalog Moderator" = `product:read`,
  `product:flag`, `review:moderate`) **without a code deploy**.
- Restricting an Admin ("this Admin can manage coupons but not sellers") is just
  removing a permission from their grant.
- Adding a feature = adding its permissions to the seed + relevant roles; no
  scattered conditionals to hunt down.

## 3. Role definitions

### Guest
- Browse catalog, search, view product/seller pages, read reviews.
- Local cart (client/Redis, no account).
- Must register/login to checkout.

### Buyer (`BUYER`, scope `self`)
- A `BUYER` grant (scope `self`) is created at registration.
- Everything Guest can do, plus:
- Manage profile, addresses, payment methods, notification preferences.
- Cart persistence, wishlist, checkout, place orders.
- Track orders, cancel (pre-dispatch), request return/refund.
- Write/edit/delete own reviews (one per purchased product).
- Message sellers; open a dispute; report a product/seller/review.
- Download invoices; view order history.

### Seller (`SELLER`, scope `seller:{id}`)
- Onboarding: register shop, submit verification docs, bank details.
- Shop: profile, logo/banner, policies (shipping, returns), business hours.
- Catalog: create/update/delete **own offers**; propose new catalog products
  (Admin/moderation approves new base products to prevent catalog pollution);
  manage variants, price, stock, images, condition.
- Inventory: stock levels, low-stock alerts, bulk CSV import/export.
- Orders: view own sub-orders, accept/confirm, mark packed/shipped, add tracking,
  print packing slip, handle cancellations/returns for own items.
- Promotions: create seller-scoped coupons/discounts within platform rules.
- Finance: view balance, escrow status, payout schedule, statements, fees.
- Analytics: sales, views, conversion, best-sellers, buy-box/ranking hints.
- Support: reply to buyer messages, respond to disputes, respond to reviews.
- **Cannot**: see other sellers' data, platform-wide settings, other sellers'
  buyers' PII beyond what fulfilment needs (shipping name/address for their
  own sub-orders only).

### Service Admin (`SERVICE_ADMIN`, scope `global`, read-mostly)
Trust, safety, and support. Keeps eyes on the marketplace.
- Reports queue: triage/resolve reports on products, sellers, reviews, messages.
- Reviews moderation: approve/reject/redact reviews, remove abusive content.
- Messaging oversight: view escalated threads, join as mediator, apply canned
  responses, lock a thread.
- Disputes: work dispute cases up to a **decision recommendation**; execute
  refunds only up to a configurable cap (above cap → Admin approval).
- Apply **soft** actions: warn a user, temporarily hide a listing, restrict
  messaging, flag an account for review.
- **Cannot**: create/remove sellers or buyers permanently, change commissions,
  manage coupons/campaigns, manage other staff, change platform config.

### Admin (`ADMIN`, scope `global`)
Operations. Everything Service Admin can do, plus:
- Buyers: view, suspend, ban, anonymize/GDPR-delete, adjust store credit.
- Sellers: approve/reject applications, verify KYC, suspend, offboard
  (triggers seller-offboarding saga), set per-seller commission overrides.
- Catalog governance: approve new base products, manage categories, brands,
  attributes, taxonomy; merge duplicates; set catalog rules.
- Promotions: create/manage **platform-wide** coupons, campaigns, banners,
  featured placement; approve seller promotions that need review.
- Orders: view any order, force-cancel, issue refunds above the Service Admin
  cap, resolve escalated disputes.
- Content: CMS pages, homepage merchandising, help center.
- Reports: financial and operational reports, exports.
- **Cannot**: manage other Admins or Super Admins, change global financial
  config (commission defaults, payout rails, tax config), toggle
  infrastructure-level feature flags, access secrets.

### Super Admin (`SUPER_ADMIN`, scope `global`)
Platform owner. Everything, plus the things Admins can't:
- Staff management: invite/create/suspend/remove **Admins and Service Admins**;
  create custom staff roles; assign/revoke any permission; set per-Admin
  restrictions.
- Global financial config: default commission %, category-specific commissions,
  payout schedule/rails, tax rules, currency, escrow hold period.
- Platform config & feature flags, maintenance mode.
- View the full audit log; configure retention and compliance settings.
- Break-glass access (heavily audited, alerts other Super Admins).
- **Guardrails**: destructive/global actions require re-auth (2FA step-up) and,
  for the most dangerous (delete Admin, change commission, wipe data),
  **four-eyes approval** from a second Super Admin.

## 4. Permission matrix (excerpt — full list generated from `@shopnetic/auth`)

Grid-table trial (borders between every cell). `yes` = role has the permission;
`—` = not applicable; `partial` / `full` = scoped down / unrestricted in the read
query. (Emoji are omitted here — they misalign a fixed-width grid; the rest of
this doc uses ✅ / — / ⚠️, see the legend at the top.)

+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| Permission                                          | Buyer | Seller | Service Admin | Admin   | Super Admin |
+=====================================================+=======+========+===============+=========+=============+
| `catalog:browse`                                    | yes   | yes    | yes           | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `order:place`                                       | yes   | —      | —             | —       | —           |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `offer:manage` (own)                                | —     | yes    | —             | —       | —           |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `product:approve` (new base)                        | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `product:manage` (base products, options, variants) | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `review:moderate`                                   | —     | —      | yes           | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `report:resolve`                                    | —     | —      | yes           | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `dispute:refund` (<= cap)                           | —     | —      | yes           | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `dispute:refund` (> cap)                            | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `buyer:suspend`                                     | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `seller:approve`                                    | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `coupon:platform:manage`                            | —     | —      | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `coupon:seller:manage` (own)                        | —     | yes    | —             | yes     | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `commission:configure`                              | —     | —      | —             | —       | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `staff:manage`                                      | —     | —      | —             | —       | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `role:define`                                       | —     | —      | —             | —       | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `featureflag:toggle`                                | —     | —      | —             | —       | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `auditlog:read`                                     | —     | —      | partial       | partial | full        |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+
| `auditlog.full:read`                                | —     | —      | —             | —       | yes         |
+-----------------------------------------------------+-------+--------+---------------+---------+-------------+

`auditlog:read`'s "partial" concretely means: every `staff:manage`-gated
action (inviting, role-changing, unlocking/reactivating, deprovisioning, or
resetting another staff member's TOTP — section 3's Super-Admin-only "Staff
management: invite/create/suspend/remove Admins and Service Admins") is
excluded. Everything else — catalog events, and identity events about an
account's own security/lifecycle (logins, password resets, MFA, session/
token-reuse events) — stays visible; Service Admin's trust-and-safety remit
needs that security visibility even though it can't itself manage staff.

## 5. Auth mechanics (details in `16-security.md`)

- Access JWT: 10–15 min TTL, carries `sub` + `sid` (session id). Signed RS256
  via JWKS. **Note:** grants/permissions are *not* in the token — the API
  rebuilds the `Actor` from the DB per request (see below), so the token stays
  small and stale grants are impossible.
- Refresh token: opaque, httpOnly cookie, 30-day sliding, **rotated on every
  use**, family-revoked on reuse detection.
- Staff sessions: shorter refresh (8h, `sn_srt` cookie), **mandatory TOTP**
  (implemented), step-up re-auth for sensitive actions (deferred until the first
  such action exists). Staff login is two-legged: `POST …/staff/auth/login`
  `{ email, password }` → if not yet enrolled, returns a TOTP enrolment
  challenge (secret + `otpauth://` URI); `POST …/staff/auth/totp/confirm`
  `{ email, password, code }` confirms the authenticator and returns one-time
  **recovery codes** + a session. Thereafter `login` requires `code` (a TOTP
  code or a single-use recovery code); missing → `401 MFA_REQUIRED`, wrong →
  `401 MFA_INVALID`. TOTP seeds are AES-256-GCM encrypted at rest
  (`TOTP_ENC_KEY`).
- Enforcement (implemented, `apps/api/src/auth/`): `AuthGuard` verifies the
  bearer token (signature + `iss` + `aud`) and loads the `Actor`
  (`ActorService`: grants → roles → permissions). `@RequirePermission(perm,
  scopeResolver?)` + `PermissionGuard` call `can()` from `@shopnetic/auth`;
  deny → `403`, object-ownership fail → `404`.
- Because the `Actor` is per-request, a **permission change is effective
  immediately** (no waiting for the next refresh; the Realtime
  session-invalidation event is only needed to kill in-flight *sessions*).
- **Every privileged mutation emits an `audit_event`** (`AuditService`): who,
  what, target, before/after, IP, correlation ID. Append-only. Auth events
  (`identity.account_registered` / `email_verified` / `session_created` /
  `login_failed` / `token_reuse_detected`, and on the staff side
  `staff_invited` / `staff_invite_accepted` / `totp_enrolled` /
  `staff_session_created` / `staff_login_failed` / `staff_mfa_failed`) are
  recorded too.

## 6. Edge cases to handle

- Seller account suspended mid-checkout → their items drop from carts with a
  clear message; order not blocked for other sellers' items.
- Buyer requests GDPR deletion but has open orders/disputes → anonymize PII,
  retain transactional records for legal retention window.
- Staff member demoted while logged in → active session's grants revoked within
  one refresh cycle; in-flight privileged request rejected by the guard.
- Same email used for Buyer signup and later a staff invite → block; staff must
  use a separate address (or explicitly link with Super Admin approval).
- Seller also buys from the marketplace → allowed; separate grants, cannot
  review/deal with own shop.

---

## 7. UI Tests Specification (Dual-Plane Authentication & RBAC Invariants)

### Comprehensive Identity UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` (staff portal) and `apps/storefront` (buyer portal) against `apps/api` identity and auth modules. Cross-referenced with feature specs in [`plan/04`](file:///var/www/html/idea/shopnetic/plan/04-features-buyer.md#ui-tests-specification) (Buyer) and [`plan/06`](file:///var/www/html/idea/shopnetic/plan/06-features-admin.md#ui-tests-specification) (Staff & Sessions).

```
Group 1: Staff Onboarding, TOTP MFA Enrollment & Recovery Codes
Group 2: Staff Session Management & Security Isolation
Group 3: Buyer Authentication & Refresh Rotation
Group 4: Dual-Plane Access Control & Guard Invariants
Group 5: Network, Loading & Resiliency Tests
```

---

#### Group 1: Staff Onboarding, TOTP MFA Enrollment & Recovery Codes

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Invite Acceptance Screen | Staff invite acceptance | Follow invitation URL (`/[locale]/x7f2k9t3m1qp/accept-invite?token=<token>`). | Renders password setup screen; validates complexity rules; activates staff account. | `tmp/admin/staff/07-admin-accept-invite.png` |
| **1.2** | Mandatory TOTP MFA Enrollment | MFA onboarding | Initial login after invite acceptance. | Prompts TOTP QR code and setup secret; requires 6-digit TOTP code verification to proceed. | `tmp/admin/staff/05-totp-reset-dialog.png` |
| **1.3** | Emergency Recovery Codes Display | Recovery codes view | Complete TOTP verification. | Renders 8 emergency single-use recovery codes; requires explicit acknowledgement checkbox to proceed. | `tmp/admin/staff/05-totp-reset-dialog.png` |
| **1.4** | TOTP Login Challenge | Staff login screen | Enter valid email and password on `/x7f2k9t3m1qp/login`. | Triggers TOTP challenge step; entering valid authenticator code establishes session. | `tmp/admin/staff/06-admin-login-screen.png` |

---

#### Group 2: Staff Session Management & Security Isolation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Active Sessions View | Session manager | View active sessions in staff sessions page (`/staff/sessions`). | Lists active device sessions with browser, OS, IP address, and "This device" marker. | `tmp/admin/staff/03-staff-sessions.png` |
| **2.2** | Remote Session Revocation | Session revocation | Click "Log out" on an alternate device session. | Revokes session instantly via API; target device refresh cookie `sn_srt` is invalidated. | `tmp/admin/staff/03-staff-sessions.png` |
| **2.3** | Revoke All Other Sessions | Bulk revocation | Click "Log out other devices". | Terminates all sessions except current active session; audit event logged. | `tmp/admin/staff/03-staff-sessions.png` |

---

#### Group 3: Buyer Authentication & Refresh Rotation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Buyer Registration & Email Verification | Storefront register | Submit registration form with valid email and password (`/en/register`). | Account created; verification email dispatched to Mailpit; enumeration-safe response. | `tmp/storefront/auth/02-buyer-register.png` |
| **3.2** | Buyer Login & Cookie Set | Storefront login | Submit valid credentials on `/en/login`. | Sets HTTP-only `sn_rt` cookie; UI reflects authenticated header state. | `tmp/storefront/auth/01-buyer-login.png` |
| **3.3** | Email Verification Prompt | Verify email route | Follow verification redirect to `/en/verify-email?email=...`. | Displays email confirmation instructions with resend action cooldown. | `tmp/storefront/auth/03-buyer-verify-email.png` |

---

#### Group 4: Dual-Plane Access Control & Guard Invariants

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Storefront Cookie Blocked on Admin | Dual-plane guard | Access admin route segment while authenticated only as a buyer (`sn_rt` set). | Returns HTTP 401; redirects visitor to staff login screen (`/x7f2k9t3m1qp/login`). | `tmp/admin/staff/06-admin-login-screen.png` |
| **4.2** | Obfuscated Base Path 404 Guard | Root path security | Navigate to unauthenticated base route segment `/en/` or `/en/admin`. | Returns HTTP 404 Not Found; reveals no administrative presence or login endpoints. | `tmp/admin/staff/08-admin-root-404.png` |
| **4.3** | Signed-In Redirect Protection | `redirectIfSignedIn` | Navigate to `/x7f2k9t3m1qp/login` with active staff session. | Automatically redirects authenticated staff member to dashboard (`/catalog/categories`). | `tmp/admin/staff/01-staff-directory.png` |

---

#### Group 5: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **5.1** | Initial Auth Form Skeletons | Inject 1500ms delay (`DEV_RESPONSE_DELAY_MS=1500`). | Auth card renders stable skeleton placeholders during initial mount without layout shift. | `tmp/admin/staff/06-admin-login-screen.png` |
| **5.2** | Double-Submit Prevention | Inject 1500ms latency on login/verify POST. | Submit button disables with inline `Spinner`, preventing duplicate authentication attempts. | `tmp/admin/staff/06-admin-login-screen.png` |
| **5.3** | Synthetic 500 Authentication Fault | Inject 500 status on auth endpoints. | Displays localized error banner without crashing client state; permits retry. | `tmp/admin/staff/06-admin-login-screen.png` |
| **5.4** | Offline Disconnection Guidance | DevTools offline mode. | Displays `errors.offline` connection guidance banner. | `tmp/admin/staff/06-admin-login-screen.png` |

---

## Changelog

- 2026-10-09 — Added Section 7 UI Tests Specification (Dual-Plane Authentication & RBAC Invariants) and Build progress summary.
- 2026-08-31 — Initial draft.
