# 06 — Features: Back Office (Service Admin / Admin / Super Admin)

Status: DRAFT
Related: `03-users-and-rbac.md`, `16-security.md`, `18-observability.md`

Shared shell: one admin app, one design system (same tokens as storefront,
denser layout), left-nav modules gated by permission. Every screen: search,
saved filters, bulk actions, CSV export, and an **activity/audit tab**.

## Cross-cutting back-office requirements

- **Audit log**: every mutation records actor, action, target, before/after diff,
  reason (required for destructive actions), IP, correlation id. Immutable,
  searchable, exportable. Super Admin sees all; lower tiers see their own +
  scope-relevant.
- **Impersonation / "view as"**: read-only view-as-buyer/seller for support,
  behind permission + audit + banner. Write-mode impersonation = Super Admin only,
  time-boxed, heavily logged.
- **Four-eyes**: config-flagged actions (delete admin, change commission,
  bulk-refund, data wipe) need a second approver.
- **Maintenance / kill switches**: feature flags, read-only mode, checkout freeze,
  new-seller-signup freeze.
- **Saved views & queues**: work-queue UX (claim, assign, SLA timer, snooze).

---

## Service Admin — Trust, Safety & Support

| Module | Capabilities |
|--------|--------------|
| Reports queue | Triage reports (product/seller/review/message/user). Categorize, assign, resolve with action, link related reports. |
| Review moderation | Approve / reject / redact reviews; remove policy-violating content; restore. Bulk. |
| Messaging oversight | View escalated threads; join as mediator; canned replies; lock/mute a thread; flag participant. |
| Dispute handling | Work cases: gather evidence from both sides, timeline, recommend outcome; execute refund **up to cap**; above cap → route to Admin. |
| Soft enforcement | Warn user, temporarily hide listing, restrict messaging/reviews for an account, flag for Admin review. |
| Content flags | Image/description auto-flags (moderation service) review queue. |
| Support tickets | Buyer/seller tickets: respond, categorize, escalate, macros, CSAT. |
| Knowledge base | Draft/suggest help articles (publish needs Admin). |

**Cannot**: permanent bans, seller approval/offboarding, commissions, coupons,
staff management, platform config.

---

## Admin — Operations

Everything Service Admin can do, plus:

| Module | Capabilities |
|--------|--------------|
| Buyer management | Search; view profile/orders/tickets; suspend/ban/reinstate; GDPR anonymize/delete; adjust store credit (audited, reason). |
| Seller management | Application review & KYC approve/reject; verify bank; suspend/reinstate; **offboard** (starts saga); set per-seller commission override & reserve %; assign account manager. |
| Catalog governance | Approve/merge/reject proposed products; manage category tree, brands, attributes, attribute-per-category rules; taxonomy edits; restricted-category rules; bulk recategorize; duplicate detection. |
| Listing enforcement | Suppress/reinstate listings; force price/label fixes; category-wide policy sweeps. |
| Promotions (platform) | Create/manage platform coupons & campaigns (budget, funding split, eligibility, schedule); homepage/merch slots; featured placement; approve seller promos needing review. |
| Orders | View any order; force-cancel; refund above Service Admin cap; resolve escalated disputes; manual order note/adjustment (audited). |
| Payments/finance (ops) | View ledger & payout runs; retry failed payouts; place/lift payout holds; issue goodwill credits; **cannot** change financial config. |
| CMS | Homepage, landing pages, banners, help center, email/notification templates, legal pages (versioned). |
| Reports & analytics | GMV, orders, refunds, disputes, seller/buyer cohorts, tax reports, exports, scheduled reports. |
| Shipping config | Carriers, zones, default rate tables, serviceability rules. |

**Cannot**: manage Admins/Super Admins, change global financial config
(default commission, payout rails, tax config, escrow period, currency),
toggle infra feature flags, access secrets.

---

## Super Admin — Platform Owner

Everything Admin can do, plus:

| Module | Capabilities |
|--------|--------------|
| Staff & roles | Invite/create/suspend/remove Admins & Service Admins; create **custom staff roles**; assign/revoke individual permissions; per-admin restrictions & scopes; enforce 2FA/IP rules. |
| Global financial config | Default & category commissions; payment providers & routing; payout rails/schedule; escrow hold period; reserve policy; tax engine config; currency & rounding. |
| Platform config | Feature flags, maintenance/read-only mode, rate-limit tiers, signup toggles, environment banners. |
| Policy & compliance | Terms/policy versions & forced re-accept; data retention windows; audit-log retention; export/erasure request handling config. |
| Security ops | View full audit log; break-glass access (alerts peers); session/global token revocation; API key & webhook secret management (values via secret manager, not shown). |
| Danger zone | Bulk data operations, seller/category mass actions, tenant-wide exports — all four-eyes + step-up auth. |

---

## Permission-driven, not role-hard-coded

Each module above declares the permissions it needs (`report:resolve`,
`seller:approve`, `commission:configure`, …). Roles are seed bundles. A Super
Admin can compose a new role (e.g. "Finance Ops" = ledger read + payout retry +
report export) with **no deploy**. See `03-users-and-rbac.md`.

## Admin UX edge cases

- Concurrent edits on the same entity → optimistic lock, "changed since you
  loaded" conflict prompt.
- Bulk action partially fails → per-row result report, safe retry of failures.
- Destructive action without reason → blocked.
- Admin loses permission mid-session → next action denied by guard, toast +
  redirect.
- Very large export → async job → download link + email, not a blocking request.
- Impersonation session must auto-expire and be one-click-exitable.
