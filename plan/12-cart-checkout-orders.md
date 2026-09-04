# 12 — Cart, Checkout & Orders

Status: DRAFT
Related: `07-data-model.md`, `13-payments-and-payouts.md`, `02-architecture.md`

The single most correctness-sensitive flow. Multi-seller cart → one order → many
sub-orders, coordinated by a **saga** with explicit compensations.

## 1. Cart

- **Guest cart**: keyed by `anon_id` cookie, stored in Redis (+ periodic Postgres
  snapshot). TTL ~30 days.
- **User cart**: Postgres, one `active` cart per account.
- **Merge on login**: union by (offer_id); qty = max or sum (decide — leaning
  sum, capped at max_qty); re-price; report removed/limited items.
- Each `cart_item` stores `added_price`; on every cart view we revalidate price &
  availability against current offers and surface deltas — we never silently
  change the price the user saw.
- Cart grouped by seller in UI; per-seller subtotal, shipping, promo.
- Cart is **not** a stock reservation. Stock is only held during checkout.

### Cart edge cases
- Offer paused/deleted → line marked unavailable, excluded from totals, kept
  visible with reason.
- Seller on vacation → same.
- Qty > available → clamp to available with notice.
- Price changed → show old→new, require acknowledge before checkout.
- Currency mismatch (future multi-currency) → block, force single currency.

## 2. Checkout flow (steps)

1. **Start session** — snapshot cart into `checkout_session` (immutable line set
   for this attempt), validate every line (exists, active, seller live).
2. **Address** — choose/add shipping address; per-seller **serviceability**
   check; billing address.
3. **Shipping** — per seller: fetch rate options (Shipping context), pick method,
   compute ETA.
4. **Promotions** — apply platform + seller coupons; validate eligibility,
   stacking rules, budget; compute discount allocation per line.
5. **Tax** — compute per line/sub-order (Tax config; seller is merchant of
   record). Show line items.
6. **Review** — full breakdown per seller + grand total; T&C acceptance.
7. **Reserve stock** — create `stock_reservation` (state `held`, TTL ~10–15 min)
   for every line. If any fails → show which, let user adjust, release the rest.
8. **Create payment intent** — amount = grand total, `Idempotency-Key` from
   client; provider session (3DS/redirect if needed).
9. **Confirm** — `POST /checkout/sessions/{id}/confirm` (idempotent). Kicks the
   **place-order saga**.

Checkout pages are `no-store`, never cached, CSRF-protected, rate-limited.

## 3. Place-order saga

Orchestrated (a `checkout` process manager holds state). Steps + compensation:

| # | Step | On failure → compensate |
|---|------|-------------------------|
| 1 | Re-validate session (prices, stock reservations still `held`, coupons still valid) | Abort, release reservations, tell user what changed |
| 2 | Capture/confirm payment (or authorize now, capture on ship — see section 7) | Abort, release reservations |
| 3 | Create `order` (with `idempotency_key`) + `sub_order` per seller + `order_line` snapshots | Refund payment, release reservations |
| 4 | Commit stock: reservations `held → committed`, decrement `on_hand` | Refund, restore stock, cancel order |
| 5 | Write ledger journal: buyer→escrow (grand total), record platform commission accrual per sub-order | Reverse journal, refund, restore stock, cancel order |
| 6 | Record `coupon_redemption` (enforce limits with row lock) | Reverse redemption |
| 7 | Emit `order.placed` (+ per `sub_order.created`) | — (downstream is idempotent) |
| 8 | Downstream reactions (async, no compensation needed): notify buyer & sellers, clear cart, trigger fulfilment timers, update search popularity, analytics | Retried via queue + DLQ |

Rules:
- Every step idempotent; saga can resume after a crash from persisted state.
- Steps 3–6 ideally in **one Postgres transaction** within the Orders+Payments
  boundary if co-located; if split across services, each is its own tx with
  outbox + saga compensation.
- Partial success is never user-visible: either the whole order is placed or none
  of it (money + stock + order all consistent).
- Timeout on the saga → auto-compensate + alert.

## 4. Order & sub-order lifecycle

```
sub_order:
  pending ──confirm──► confirmed ──pack──► packed ──ship──► shipped ──deliver──► delivered ──window closes──► completed
     │                    │                                     │
     └── cancel ──────────┴───────── cancel(pre-ship) ──────────┘
  delivered ──return_request──► return_requested ──approve──► return_in_transit ──receive──► returned ──► refunded
  any ──dispute──► disputed ──resolve──► (completed | refunded | partially_refunded)
```

- **Parent `order` status** = derived rollup (e.g. all sub-orders delivered →
  `delivered`; mixed → `partially_*`).
- Each transition writes an `order_event` (timeline) and emits a domain event.
- **Handling deadline** per sub-order (from seller policy); breach → seller
  health hit + buyer notification + auto-cancel option.
- **Escrow release timer**: starts at `delivered`; after review window (config,
  e.g. 3–7 days) with no dispute → funds move escrow→seller available balance
  (ledger journal), minus commission.

## 5. Cancellations

| Initiator | When | Effect |
|-----------|------|--------|
| Buyer | before `packed` | Auto-approved. Refund saga (full for that line/sub-order). Restore stock. |
| Buyer | after `shipped` | Not a cancel — becomes return flow. |
| Seller | before `shipped` | Requires reason. Refund + stock restore + seller health hit. |
| Admin | any | Force-cancel with reason (audited); refund saga. |
| System | seller suspended / stock impossible / payment reversed | Auto-cancel affected sub-orders only. |

Partial cancel: per line or per sub-order; recompute sub-order totals, discounts
re-allocated, tax recomputed, partial refund via ledger.

## 6. Returns & refunds

1. Buyer requests return (per item, reason code, photos) within return window.
2. Seller (or Service Admin if seller unresponsive/rejects unfairly) reviews →
   approve/deny. Deny is disputable.
3. Approved → RMA + return label (Shipping). Status `return_in_transit`.
4. Seller receives + inspects → refund / replace / partial refund / deny.
5. **Refund saga**: ledger reversal (escrow or seller balance → buyer), choose
   destination (original method via gateway, or store credit), restore stock if
   resellable, emit `refund.completed`, notify, adjust seller metrics.
- Refund amount ≤ captured amount for that sub-order (invariant).
- Refunds after payout → clawback from seller's next payout / reserve; if
  impossible, platform absorbs + flags seller.
- Chargebacks: gateway webhook → open dispute, freeze equivalent seller funds,
  Trust & Safety workflow.

## 7. Payment capture timing — decision needed (`22`)

| Option | Pro | Con |
|--------|-----|-----|
| **Capture at order placement** (into escrow) | Simplest ledger; buyer definitely paid; funds secured | Must refund on every cancel; some regulations limit holding pre-ship |
| **Authorize at placement, capture at ship** (per sub-order) | Only charge what ships; fewer refunds; partial-ship friendly | Auth expiry (~7 days) risk; re-auth logic; ledger more complex |

Leaning: **authorize + capture-on-ship per sub-order** for physical goods, with
escrow starting at capture. Revisit with payment provider capabilities.

## 8. Idempotency & concurrency

- `Idempotency-Key` on add-to-cart, session confirm, cancel, refund.
- `order.idempotency_key` unique → double "place order" returns same order.
- Stock decrement uses `UPDATE ... SET on_hand = on_hand - :q WHERE on_hand -
  reserved >= :q` (atomic, no oversell).
- Coupon limits enforced with `SELECT ... FOR UPDATE` or unique partial index on
  `coupon_redemption`.
- Reservation TTL sweeper releases expired holds and frees stock.

## 9. Notifications around orders (see `15`)

Buyer: placed, payment confirmed, each sub-order confirmed/shipped/out-for-
delivery/delivered, cancelled, refund issued, return updates, review prompt.
Seller: new sub-order, cancellation, return request, payout for the order.
Real-time push to open order/tracking pages via Realtime Gateway.

## 10. Invoices & documents

- Per sub-order invoice (seller = merchant of record) as PDF, generated async,
  stored in object storage, linked from order detail.
- Platform receipt for the whole order.
- Credit note on refund.
- Packing slip for seller.

## 11. Testing focus (see `19`)

- Saga compensation paths (inject failure at each step).
- Oversell race (concurrent last-item purchases).
- Coupon over-redemption race.
- Idempotent double-confirm.
- Partial shipment + partial return + partial refund math.
- Seller suspended mid-order.
- Payment webhook arriving before/after confirm response (out-of-order).
