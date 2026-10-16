# 06 — Features: Back Office (Service Admin / Admin / Super Admin)

Status: DRAFT
Related: `03-users-and-rbac.md`, `16-security.md`, `18-observability.md`

**Build progress:** built so far — **Admin Portal UI Shell** (`apps/admin`) with obfuscated
base path segment (`/[locale]/x7f2k9t3m1qp/`), collapsible sidebar, dark/light tokens,
and breadcrumbs; **Staff Management UI & API** (invite-only flow, role assignment, account
suspend/reinstate, TOTP reset, self-deprovisioning guard); **Staff Session Management UI**
(view active devices, remote revocation, bulk revoke all other sessions); and **Audit Log Viewer**
(chronological events, actor/action/target/date filters with URL query sync, before/after JSON
diff modal, deep-link targeting to Staff and Category rows).
**Catalog Governance built so far:** Category tree management, Brand management with merge
tool, Option types & values, Value sets, Category-options mapping, Products, Variants,
Media gallery, and Offers & Stock management with Buy-Box winner diagnostics (see `plan/26`).
**Deferred:** Impersonation / "view as", four-eyes approval workflow for platform config,
customer support ticketing / dispute resolution queues, carrier/shipping config tables.

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

---

## UI Tests Specification (Staff, Sessions & Audit Log)

### Comprehensive Back Office UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` (obfuscated base route `/x7f2k9t3m1qp/`) against `apps/api` identity & audit services (`AuditService`, `StaffService`, `SessionService`).

```
Group 1: Staff Member Management & Lifecycle
Group 2: Staff Login Sessions Management & Revocation
Group 3: Audit Log Viewer, Query Sync & Diff Inspector
Group 4: Network, Loading & Resiliency Tests
```

---

#### Group 1: Staff Member Management & Lifecycle

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Staff Directory & Roles | `StaffList` (`/staff`) | Navigate to `/x7f2k9t3m1qp/staff` as Super Admin. | Displays staff table with Avatar, Name, Email, Role badge (`SUPER_ADMIN`, `ADMIN`, `SERVICE_ADMIN`), Status (`ACTIVE` / `SUSPENDED`), and 3-dots actions menu. | `tmp/admin/staff/01-staff-directory.png` |
| **1.2** | Invite Staff Member Form | `InviteStaffForm` (`/staff/invite`) | Navigate to `/staff/invite` or click Invite. | Opens form with Email input, Role Radix Select dropdown (`SERVICE_ADMIN`, `ADMIN`, `SUPER_ADMIN`), and Submit button. | `tmp/admin/staff/02-invite-staff-form.png` |
| **1.3** | Accept Invite Screen | Invite acceptance | Follow invite link in Mailpit email to `/accept-invite?token=...`. | Opens password setup form followed by mandatory TOTP enrollment (QR code + secret key + 8 recovery codes). | `tmp/admin/staff/07-admin-accept-invite.png` |
| **1.4** | Staff Row Actions Menu | Action dropdown | Click 3-dots action menu on a staff row. | Displays actions: "Change role" (with standardized Radix Select), "Unlock" / "Reactivate", "Reset authenticator", "Deprovision". | `tmp/admin/staff/04-staff-row-actions.png` |
| **1.5** | TOTP Reset Confirmation | Staff security action | Select "Reset authenticator" for a staff member enrolled with TOTP. | Confirmation dialog opens displaying reset consequences warning; confirming resets TOTP secret in DB. | `tmp/admin/staff/05-totp-reset-dialog.png` |
| **1.6** | Staff Directory Search Filter | Staff search input | Enter search query in staff search box. | Table filters dynamically to matching staff accounts by email address. | `tmp/admin/staff/10-staff-search-filter.png` |
| **1.7** | Self-Deprovisioning Guard | Self-action guard | Super Admin inspects actions menu on their own account row. | "Change role" and "Deprovision" options are disabled to prevent lockout of the active Super Admin. | `tmp/admin/staff/04-staff-row-actions.png` |

---

#### Group 2: Staff Login Sessions Management & Revocation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Active Devices Table | `StaffSessionsList` (`/staff/sessions`) | Navigate to `/x7f2k9t3m1qp/staff/sessions`. | Displays all active device sessions with IP address, Device user-agent, Last Active timestamp, and Current Device marker. | `tmp/admin/staff/03-staff-sessions.png` |
| **2.2** | Current Device Badge | Session row | Inspect current active browser session row. | Highlighted with "This device" badge; single logout button disabled on current row to avoid mid-session termination. | `tmp/admin/staff/03-staff-sessions.png` |
| **2.3** | Remote Session Revocation | Single revocation | Click "Log out" button on an alternate device session. | Session is immediately purged in Redis and DB; target device is forced to re-authenticate on next request. | `tmp/admin/staff/03-staff-sessions.png` |
| **2.4** | Bulk Revoke Other Devices | Bulk revocation button | Click "Log out other devices". | Terminates all sessions except current active session; audit event logged. | `tmp/admin/staff/03-staff-sessions.png` |

---

#### Group 3: Audit Log Viewer, Query Sync & Diff Inspector

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Audit Events Table | `AuditLogView` (`/audit-log`) | Navigate to `/x7f2k9t3m1qp/audit-log`. | Displays chronological table with Timestamp, Actor, Action (`CATEGORY_UPDATE`, `STAFF_INVITE`, `BRAND_MERGE`), Target, and IP. | `tmp/admin/audit-log/01-audit-log-table.png` |
| **3.2** | Filter Popover with URL Synchronization | Audit filters popover | Click Filters trigger to open popover; configure Domain and Target type using Radix Select, and date bounds. | Popover renders cleanly; Domain & Target type dropdowns use standardized Radix Select with primary background and white text on selected; table filters instantly; filter parameters persist in URL query. | `tmp/admin/audit-log/02-audit-filters-open.png` |
| **3.3** | Expanded Before/After Diff | Audit detail row | Click chevron detail toggle on an audit event with diff data. | Expands detail section displaying `changed` fields with red strikethrough for previous values and green for new values. | `tmp/admin/audit-log/03-audit-diff-expanded.png` |
| **3.4** | Audit Multi-Word Search | Audit search bar | Enter search term (e.g. "category") in search input. | Dynamically filters audit log entries matching actor, target, or action name. | `tmp/admin/audit-log/04-audit-search-filter.png` |
| **3.5** | Mobile Responsive Cards | Mobile breakpoint | View audit log at 390×844 mobile viewport. | Adapts to stacked card layout with expandable detail panels. | `tmp/admin/audit-log/05-audit-mobile-cards.png` |

---

#### Group 4: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **4.1** | Initial Loading Skeletons | Inject 1500ms delay. | Skeletons pulse cleanly across staff and audit tables without layout jump. | `tmp/admin/staff/01-staff-directory.png` |
| **4.2** | Double-Click Action Guard | Inject 1500ms delay on invite/revoke. | Action buttons disable immediately with active spinner. | `tmp/admin/staff/02-invite-staff-form.png` |
| **4.3** | Synthetic Server 500 Fault | Inject 500 status on `/admin/v1/audit-events`. | Catches error envelope; renders localized error boundary card with functional "Retry" button. | `tmp/admin/audit-log/01-audit-log-table.png` |
| **4.4** | Offline Disconnection Guidance | DevTools offline mode. | Displays localized `errors.offline` guidance notification. | `tmp/admin/audit-log/01-audit-log-table.png` |

---

## Changelog

- 2026-10-16 — Completed standardized `@radix-ui/react-select` migration across Administration (Staff & Audit Log): converted native selects in `StaffList` role change modal, `InviteStaffForm` role picker (via `react-hook-form` `Controller`), and `AuditLog` domain/target-type filters (with clean `'__all__'` empty-value mapping); elevated `z-[60]` floating content; full test suite passing with 0 warnings.
- 2026-10-09 — Added UI Tests Specification (Staff, Sessions & Audit Log) covering staff management lifecycle, session revocation, audit log viewer with URL query sync, and resiliency.
- 2026-08-31 — Initial draft.
