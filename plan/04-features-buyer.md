# 04 — Features: Guest & Buyer

Status: DRAFT
Related: `11-search-and-catalog.md`, `12-cart-checkout-orders.md`, `10-seo-strategy.md`,
`26-catalog-options-variants-brands.md` (variant selection UX),
`27-merchandising-and-ranking.md` (home ordering, "also viewed"/"related"),
`28-page-loading-and-rendering.md` (progressive PDP, infinite scroll),
`29-cart-and-listing-change-alerts.md` (returning-buyer "your cart changed" notice)

## Guest (unauthenticated)

| Feature | Notes / edge cases |
|---------|--------------------|
| Home / merchandised landing | SSR + ISR. Slots managed by Admin CMS. |
| Category browse | Faceted, paginated, SSR. Handle empty category, deep pagination limit. |
| Search | Typo tolerance, synonyms, "no results" with suggestions. Query logged for analytics. |
| Product detail page (PDP) | SSR, structured data. Shows all seller offers for the product ("other sellers"), default = buy-box winner. Out-of-stock, discontinued, single-offer, no-image states. |
| Seller storefront page | Public shop profile + that seller's catalog + rating. |
| Reviews & Q&A (read) | Paginated, sort by helpful/recent. |
| Local cart | Stored client-side + Redis by anon id (cookie). Survives navigation, not devices. Revalidated on view. |
| Price/stock display | Always live-checked before showing "add to cart". |
| Register / login | Email+password, OAuth (Google/Apple) optional, magic link optional. Rate-limited. |
| Guest checkout? | **Decision needed** (`22`). Leaning: require account at checkout, but make signup 1-step from cart. |

## Buyer (authenticated) — account

| Feature | Notes / edge cases |
|---------|--------------------|
| Profile | Name, email (verified change flow), phone (OTP), password change, delete/anonymize request. |
| Address book | Multiple addresses, default shipping/billing, validation, label ("Home"/"Work"). |
| Payment methods | Tokenized via gateway (no raw PAN stored). Set default. Remove. |
| Notification preferences | Per-channel (email/push/in-app) × per-event (order, promo, price-drop, messages). |
| Wishlist / save-for-later | Move to cart; notify on price drop or back-in-stock (opt-in). |
| Cart merge on login | Merge guest cart into account cart; de-dupe by SKU+seller; re-price; warn on conflicts. |
| Follow sellers | Feed of new products / promos from followed sellers. |

## Buyer — discovery & PDP extras

| Feature | Notes |
|---------|-------|
| Personalized rows | "Because you viewed", "Buy again", "Popular in {category}". Heuristic v1. |
| Recently viewed | Client + server backup. |
| Compare products | Up to N in a category. |
| Stock/threshold nudges | "Only 3 left", "Ships in 2 days". |

## Buyer — cart & checkout (full flow in `12`)

| Step | Notes / edge cases |
|------|--------------------|
| Cart review | Grouped by seller. Per-seller subtotal, shipping, promo. Remove/qty change re-prices. Stock/price-change banners. |
| Address selection | Pick or add. Serviceability check per seller (some sellers don't ship everywhere). |
| Shipping options | Per seller: standard/express/pickup with ETA + cost. |
| Coupons | Apply platform + seller coupons; show why one is rejected (min spend, expired, not eligible). Stacking rules enforced server-side. |
| Tax & fees | Computed server-side, shown as line items. |
| Payment | Card, wallet, COD (if enabled per region/seller), store credit, split (credit + card). |
| Place order | Idempotency key. Creates 1 order → N sub-orders. Reserves stock. Redirects to gateway if needed (3DS). |
| Confirmation | Order number, per-seller breakdown, ETA, invoice link, "track order" CTA. |
| Failure handling | Payment fail → cart preserved, stock reservation released, clear retry path. Partial capture never leaves an order half-paid (saga). |

## Buyer — orders & post-purchase

| Feature | Notes / edge cases |
|---------|--------------------|
| Order list & detail | Status timeline per sub-order. Parent order = rollup of children. |
| Track shipment | Courier tracking events surfaced via Shipping context webhooks. |
| Cancel | Allowed only before "packed/shipped". Partial cancel (per sub-order / per item). Triggers refund saga. |
| Return / refund request | Reason codes, photo upload, per-item. Seller/Service Admin review. RMA + return label. Refund to original method or store credit. |
| Reorder | Re-adds available items; flags unavailable ones. |
| Invoices | PDF per sub-order (seller is merchant of record) + platform receipt. |
| Dispute | Opens if seller unresponsive / return rejected. Escalates to Trust & Safety. |
| Review after delivery | Prompted post-delivery. One review per purchased product; editable for a window. Verified-purchase badge. |
| Rate seller | Separate from product review. Affects seller score / ranking. |

## Buyer — messaging & support

| Feature | Notes |
|---------|-------|
| Message a seller | Pre-sale question from PDP; post-sale from order. Threaded, attachments, real-time. |
| Escalate to platform | Adds Service Admin to thread. |
| Report | Product, seller, review, or message → Trust & Safety queue. |
| Help center | Static + contextual articles. Contact form → ticket. |

## Cross-cutting buyer edge cases

- Item goes out of stock between cart and checkout → block that line, let rest proceed.
- Price increased since add-to-cart → show old/new, require explicit accept.
- Seller suspended after order placed, before fulfilment → auto-cancel that
  sub-order + refund; notify buyer; other sub-orders unaffected.
- Coupon becomes invalid between apply and pay → re-validate at "place order",
  recompute total, require re-confirm if changed.
- Buyer in region a seller can't ship to → serviceability check hides that
  seller's "add to cart" or blocks at address step with explanation.
- Double-submit "place order" → idempotency key returns the same order.
- Refund for a partially-used split payment → ledger splits refund proportionally.
