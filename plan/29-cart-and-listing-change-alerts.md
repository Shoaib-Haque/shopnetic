# 29 — Cart / Saved-Item Change Alerts

Status: DRAFT
Related: `12-cart-checkout-orders.md`, `04-features-buyer.md`, `15-realtime-and-notifications.md`, `26-catalog-options-variants-brands.md`

**Problem:** a buyer adds items to cart or wishlist, leaves, and comes back later.
Meanwhile a seller changed the price, paused or deleted the listing, ran out of
stock, or an admin removed the product; a coupon expired. When the buyer returns
we must **tell them clearly, once**, what changed — not silently alter their cart,
and not nag them on every page forever.

## 1. What we track on a cart/saved item

Each `cart_item` (and `saved_item`) records a **baseline snapshot** at add time:

```
cart_item(
  ...,
  offer_id, variant_id, seller_id,
  added_price_minor,        -- price the buyer saw
  added_qty,
  snapshot jsonb,           -- title, key option values, image key, seller name (at add time)
  added_at
)
```

## 2. Change detection — three entry points

| Entry point | Mechanism |
|-------------|-----------|
| **Event-driven (primary)** | Cart service subscribes to `offer.price_changed`, `offer.stock_changed`, `offer.paused`, `offer.deleted`, `product.archived`, `variant.deleted`, `coupon.expired`, `campaign.ended`. For each event it finds affected active carts/saved lists and writes an **alert row** (idempotent per (item, change-type, new-value)). Runs as a worker, not inline. |
| **On cart/checkout view** | Every time the cart or checkout is loaded, the service **revalidates every line** against the live offer (price, stock, status, serviceability) and reconciles — this is the authoritative check (`12` section 1). Any drift not already alerted becomes an alert row. |
| **Background sweep** | A periodic job re-checks carts older than N hours whose items had events, as a safety net for missed events. |

## 3. Alert model

```
cart_item_alert(
  id,
  cart_id, cart_item_id,          -- or saved_item_id
  change_type,                    -- see table below
  old_value jsonb, new_value jsonb,
  severity,                       -- info | action_required | blocking
  created_at,
  first_shown_at,                 -- set when the buyer has seen it in the UI
  acknowledged_at,                -- set when buyer dismisses / proceeds past it
  resolved_at,                    -- set when the underlying condition no longer applies
  superseded_by_id                -- if a newer alert for the same item replaces this one
)
```

| `change_type` | Trigger | Severity | Cart behavior |
|---------------|---------|----------|---------------|
| `price_decreased` | new price < `added_price` | `info` | Update line to new (lower) price automatically; show a positive "price dropped" note. |
| `price_increased` | new price > `added_price` | `action_required` | Show old→new; **line total uses new price**, but checkout is **blocked** until the buyer explicitly accepts the new price (per-line "OK" or "remove"). |
| `out_of_stock` | available qty = 0 | `blocking` | Move line to an "Unavailable" group, exclude from totals, show "notify me" + alternatives / other sellers for the same variant. |
| `qty_reduced` | available qty < line qty (but > 0) | `action_required` | Clamp qty to available, show "only N left — quantity reduced". |
| `listing_paused` | `offer.status = paused` (seller vacation etc.) | `blocking` | Same as `out_of_stock` but message = "temporarily unavailable from this seller"; offer other sellers. |
| `listing_removed` | offer soft-deleted | `blocking` | Move to Unavailable; if other sellers offer the same variant, offer a one-click switch. |
| `product_removed` | `product.archived` by admin | `blocking` | Move to Unavailable, message "no longer available", suggest similar (`27`). |
| `variant_gone` | selected variant deleted, product still exists | `action_required` | Prompt to pick a different variant (size/color) on the same product. |
| `seller_suspended` | seller suspended | `blocking` | Move to Unavailable; other sellers offered. |
| `coupon_invalid` | applied coupon expired / budget exhausted / no longer eligible | `action_required` | Remove coupon, recompute totals, show why, suggest available coupons. |
| `option_changed` | e.g. handling time increased materially | `info` | Show updated delivery estimate. |

## 4. "Show once" rules

- An alert is shown in the UI until `acknowledged_at` is set. It is set when:
  - the buyer dismisses the per-line notice, **or**
  - the buyer takes the implied action (accepts new price, removes the line,
    switches seller/variant), **or**
  - the buyer proceeds to checkout past that line (for `info` severity only —
    `action_required` / `blocking` must be resolved first).
- Once acknowledged, that specific alert never shows again (even on other
  devices — it's server-side state on the cart, `04` cart-merge carries it).
- If the **same item changes again** after acknowledgement (price moves a second
  time), a **new** alert row is created (baseline for comparison stays
  `added_price`, but `old_value` = the previously-acknowledged value) and it
  shows once.
- If a change **reverts** before the buyer sees it (price up then back down,
  restocked), the alert is auto-`resolved` and not shown (or shown as resolved
  info, config).
- **Entry banner**: on returning to the site with unacknowledged alerts, show a
  single summary banner / cart-badge ("3 items in your cart changed") linking to
  the cart; the detail is per-line inside the cart. The banner itself dismisses
  after one view.

## 5. UX placement

- **Cart page**: per-line inline notice (colored by severity), plus a top summary.
  Unavailable items in a separate collapsed "Saved for later / Unavailable"
  group, never in the payable subtotal.
- **Checkout**: `action_required` and `blocking` alerts **halt** the step with a
  clear resolve action; `info` alerts show as a passive note. Re-validate again
  at "place order" (`12` section 2 step 1 / section 3 step 1) — anything new there stops the
  saga with a friendly message.
- **Wishlist / saved items**: same alert model; drives `back_in_stock` and
  `price_drop` opportunities surfaced on home (`27` section 4) and via Notifications.
- All copy via i18n keys with params (`24` section 4), never hard-coded.

## 6. Relationship to the Notification service (`15`)

- The **in-site one-time notice** is the cart-reconciliation mechanism above
  (works even if the buyer has all notifications off).
- **Additionally**, per the buyer's notification preferences, the Cart service
  can ask Notifications to send: "an item in your cart dropped in price", "an item
  in your cart is selling out", "an item in your saved list is back in stock".
  These are marketing-category (consent required) except `blocking` changes to a
  cart with an in-progress checkout, which are transactional.
- No duplication: the notification links back to the cart where the same alert is
  shown and acknowledged once.

## 7. Guest carts

- Alerts are stored against the guest cart (`anon_id`). On login/merge (`04`),
  alerts migrate with the items; unacknowledged ones show once in the merged
  cart. De-dupe if the same item existed in both carts (keep the most recent
  baseline + surface a `price_changed` alert if they differ).

## 8. Edge cases

- Item changed while the buyer is **actively on the cart page** → push via
  realtime (`15`) a soft refresh prompt ("prices updated — review"), don't
  yank the DOM mid-interaction.
- Many items changed (bulk seller price update) → coalesce into one summary
  banner + per-line notices; don't create a wall of toasts.
- Alert for an item the buyer already removed → discard.
- Cart abandoned for months → on return, revalidate everything fresh; stale
  baselines older than X days show a generic "prices and availability have been
  refreshed" instead of a misleading delta.
- Currency/locale change of the buyer between visits → re-price display via
  `Intl`, not an "alert".

## 9. Data lifecycle

- `cart_item_alert` rows deleted when the cart is ordered or swept (guest TTL).
- Acknowledged `info` alerts pruned after N days.
- Aggregate (not per-user) alert stats feed reporting (`30`): how often price
  increases cause abandonment, restock conversion, etc.

## Changelog

- 2026-08-31 — Initial draft.
