# 03 — Users & RBAC

Status: DRAFT
Related: `16-security.md`, `06-features-admin.md`

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

| Permission | Buyer | Seller | Service Admin | Admin | Super Admin |
|-----------|:-----:|:------:|:-------------:|:-----:|:-----------:|
| `catalog:browse` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `order:place` | ✅ | — | — | — | — |
| `offer:manage` (own) | — | ✅ | — | — | — |
| `product:approve` (new base) | — | — | — | ✅ | ✅ |
| `review:moderate` | — | — | ✅ | ✅ | ✅ |
| `report:resolve` | — | — | ✅ | ✅ | ✅ |
| `dispute:refund` (≤ cap) | — | — | ✅ | ✅ | ✅ |
| `dispute:refund` (> cap) | — | — | — | ✅ | ✅ |
| `buyer:suspend` | — | — | — | ✅ | ✅ |
| `seller:approve` | — | — | — | ✅ | ✅ |
| `coupon:platform:manage` | — | — | — | ✅ | ✅ |
| `coupon:seller:manage` (own) | — | ✅ | — | ✅ | ✅ |
| `commission:configure` | — | — | — | — | ✅ |
| `staff:manage` | — | — | — | — | ✅ |
| `role:define` | — | — | — | — | ✅ |
| `featureflag:toggle` | — | — | — | — | ✅ |
| `auditlog:read` | — | — | partial | partial | ✅ (full) |

## 5. Auth mechanics (details in `16-security.md`)

- Access JWT: 10–15 min TTL, carries `sub` + `sid` (session id). Signed RS256
  via JWKS. **Note:** grants/permissions are *not* in the token — the API
  rebuilds the `Actor` from the DB per request (see below), so the token stays
  small and stale grants are impossible.
- Refresh token: opaque, httpOnly cookie, 30-day sliding, **rotated on every
  use**, family-revoked on reuse detection.
- Staff sessions: shorter refresh (8h), mandatory TOTP 2FA, step-up re-auth for
  sensitive actions.
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
  `login_failed` / `token_reuse_detected`) are recorded too.

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
