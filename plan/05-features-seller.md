# 05 — Features: Seller

Status: DRAFT
Related: `13-payments-and-payouts.md`, `12-cart-checkout-orders.md`, `03-users-and-rbac.md`

## 1. Onboarding & verification

| Step | Notes / edge cases |
|------|--------------------|
| Register as seller | From a normal account or fresh. Collect legal/business name, type (individual/company), country. |
| KYC / documents | ID, business registration, tax id, address proof. Upload → Admin review queue. States: `draft → submitted → in_review → approved / rejected(reason) → resubmit`. |
| Bank / payout details | Account for payouts; micro-deposit or provider verification. Editable later with re-verification + cool-off before next payout. |
| Agreement | Accept marketplace terms, commission schedule, policies. Versioned; re-accept on change. |
| Shop setup | Slug, display name, logo, banner, description, categories they sell in. |
| Go live | Only after `approved` + at least one policy set + one valid offer. |

**Edge cases**: rejected KYC with resubmission limit; duplicate business
detection; seller in a restricted category needs extra approval; seller changes
country (re-KYC).

## 2. Shop management

- Profile & branding, business hours / vacation mode (auto-pauses listings, sets
  buyer expectations, blocks new orders).
- Policies: shipping (zones, rates, handling time), returns (window, who pays),
  cancellation, warranty. These feed checkout and dispute rules.
- Shipping origin addresses (multi-warehouse optional).
- Team members (later): sub-users with limited seller permissions (`staff` role
  scoped to `seller:{id}`).

## 3. Catalog & offers

| Feature | Notes / edge cases |
|---------|--------------------|
| Find/attach to existing product | Search catalog; if the product exists, create an **offer** (price, condition, stock, handling time). Prevents duplicate catalog entries. |
| Propose new product | If not in catalog: submit product data + images → Catalog moderation. Approved → becomes base product; seller's offer attaches. |
| Variants | Define/choose variant axes (size, color…). Stock + price per SKU. |
| Media | Images (min/max, dimensions, no text-heavy/watermark rules), alt text, ordering; optional video. |
| Pricing | Base price, sale price + schedule, MSRP/compare-at, min-order-qty, max-per-order. |
| Inventory | Per SKU per warehouse. Safety stock, backorder toggle, restock date. Low-stock alerts. |
| Bulk ops | CSV/XLSX import & export, template download, dry-run with row-level errors, async job with progress + report. |
| Offer status | `active / paused / out_of_stock / under_review / suppressed(by admin)`. |
| Buy-box / ranking hints | Show why an offer isn't winning (price, rating, handling time, cancellation rate). |

**Edge cases**: two sellers propose the same new product (moderation merges);
seller edits price while item is in buyers' carts (carts re-price, buyer must
accept); image fails moderation (offer stays under_review); catalog admin edits
shared product data (offer-specific fields untouched, snapshot rules protect
existing orders).

## 4. Order fulfilment

| Feature | Notes / edge cases |
|---------|--------------------|
| Sub-order queue | Filter by status, SLA countdown (handling-time breach highlighted). |
| Accept / confirm | Optional auto-accept. Reject with reason → refund saga for that sub-order. |
| Pack & ship | Mark packed → shipped; enter carrier + tracking (or buy label via Shipping integration). Print packing slip / invoice. |
| Partial shipment | Ship available items now, rest later; each shipment tracked separately. |
| Cancellations | Buyer-initiated (pre-ship) auto-approved; seller-initiated needs reason; both trigger refund + stock return + metric hit. |
| Returns / RMA | Approve/deny per policy; generate return label; on receipt inspect → refund/replace/deny (deny can be disputed). |
| Delivery confirmation | From courier webhook or manual; starts review window and escrow-release timer. |

## 5. Promotions (within platform rules)

- Seller coupons: code or automatic, %/flat, min spend, usage caps (total/per
  buyer), date window, eligible products/collections.
- Participate in platform campaigns (opt-in, accept discount funding split).
- Flash sales / time-boxed price drops.
- Bundle / "buy X get Y" (later).
- Guardrails: platform sets max discount %, blocks below-cost if configured,
  Admin can pull a non-compliant promo.

## 6. Finance

| Feature | Notes |
|---------|-------|
| Balance overview | Available, pending (in escrow), on-hold (disputes), lifetime. |
| Transaction ledger | Every sale, fee, commission, refund, adjustment, payout — from the double-entry ledger, read-only. |
| Fees breakdown | Commission (category-based + overrides), payment processing, optional listing/shipping-label fees. |
| Payout schedule | e.g. weekly, T+N after delivery. Next payout date + projected amount. |
| Statements / invoices | Monthly PDF; tax summary; downloadable CSV. |
| Reserves | Platform may hold a rolling reserve for new/high-risk sellers. |

## 7. Analytics & insights

- Sales over time, units, AOV, conversion, traffic (views → add-to-cart → order).
- Best/worst sellers, low-stock, aging inventory.
- Quality metrics: rating, on-time-ship %, cancellation rate, return rate,
  dispute rate, response time — these gate ranking and account standing.
- Search terms leading to their products; "customers also viewed".
- Downloadable reports; scheduled email digests.

## 8. Account standing & enforcement

- Health score from quality metrics; thresholds → warning → listing suppression
  → suspension → offboarding.
- Appeals flow to Trust & Safety / Admin.
- Suspension: listings hidden, no new orders, existing orders must still be
  fulfilled or refunded; payouts may be held pending resolution.
- Offboarding saga: stop new orders → settle open orders → final payout after
  hold period → archive shop → anonymize per retention policy.

## 9. Seller support

- Reply to buyer messages (SLA tracked), canned responses.
- Respond publicly to reviews.
- Open tickets with platform support.
- Dispute console: submit evidence, accept/counter resolution.

## 10. Notifications to sellers

New order, cancellation, return request, message, payout sent, low stock,
policy/agreement change, listing moderation result, health-score threshold,
dispute update. Per-channel preferences.
