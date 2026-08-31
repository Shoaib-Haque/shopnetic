# 30 — Reporting & Analytics (Admin & Seller)

Status: DRAFT
Related: `27-merchandising-and-ranking.md`, `18-observability.md`, `07-data-model.md`, `13-payments-and-payouts.md`

**Business reporting** for Admins (platform-wide) and Sellers (their shop):
sales, traffic, clicks, conversion, inventory, finance — by day/week/month/
quarter/year and by many dimensions. This is *not* `18-observability` (that is
system health / SLOs). Both draw from the **same event pipeline** (`27` §3).

## 1. Consumers & scope

| Consumer | Scope | Access |
|----------|-------|--------|
| Seller | Own shop only: their products, variants, orders, payouts, traffic to their listings | `report:seller:read` (scope `seller:{id}`) |
| Admin | Platform-wide, drill into any seller/category/brand | `report:admin:read` |
| Super Admin | + financial/close reports, cohort exports | `report:finance:read` |
| Finance/Ops (custom role) | Ledger-reconciled money reports, payout runs | permission bundle (`03`) |

Sellers **never** see other sellers' data or buyer PII; all seller-facing figures
are their slice only.

## 2. Report catalog

### Sales & revenue
- Units sold, gross sales (GMV), net sales (after refunds/cancellations), AOV,
  order count, items per order.
- By: product, variant, category (any level), brand, seller, coupon/campaign,
  traffic source, region, new-vs-returning buyer, device.
- Time series at day / week / month / quarter / year + custom range;
  period-over-period delta and YoY.

### Traffic & funnel
- Impressions → product clicks (CTR) → PDP views → add-to-cart → checkout start →
  orders (conversion at each step), by product / category / source / campaign.
- Search: query volume, top queries, zero-result queries, search→click→purchase.
- Landing/rail performance (which home rail drives clicks/GMV — feeds `27`).

### Engagement / behavior
- Product views, unique viewers, dwell time, media opens, wishlist adds,
  "also viewed" click-through, repeat-view rate.
- Cart: add rate, abandonment rate, abandonment reasons (from `29` alerts:
  price increase, OOS), recovery rate.

### Quality
- Rating average & distribution, review volume & recency.
- Return rate, cancellation rate (buyer vs seller initiated), dispute rate,
  "not as described" rate, on-time-ship %, response time.
- Seller health score trend (`05` §7).

### Inventory
- Stock on hand (units + retail value), by product/variant/warehouse.
- Sell-through rate, days-of-cover, aging buckets, low-stock & out-of-stock
  lists, restock recommendations, dead stock.

### Finance (money figures reconcile to the ledger, `13`)
- Commission earned (platform) / paid (seller), payment processing fees, other
  fees, refunds issued, chargeback losses, net payout, reserve balance.
- Payout runs: scheduled vs paid, failures, per-seller statements.
- Platform P&L view (Admin/Finance): revenue vs costs by period.
- Tax summaries (per jurisdiction, once relevant — `22` Q11/Q24).

### Promotions
- Redemptions, discount cost, orders driven, incremental lift vs baseline,
  budget spent vs allocated, ROI, per campaign / per coupon.

### Operational (Admin)
- Seller onboarding funnel & time-to-approve, active sellers, catalog size,
  moderation queue throughput & age, dispute resolution time, ticket CSAT.

## 3. Data pipeline

```
raw events (client interactions, sampled)  ─┐
domain events (order.placed, refund.completed, review.published,               ├─► raw_event store (append-only, partitioned by day)
              return.completed, offer.stock_changed, payout.paid, ...)  ───────┘        │
                                                                                       ▼
                                                         rollup workers (BullMQ, scheduled)
                                                          hourly  -> provisional "today" tiles
                                                          daily   -> report_daily_* summary tables (after day close)
                                                          on close/reconcile -> finalize money figures vs ledger
                                                                                       │
                                          ┌────────────────────────────────────────────┤
                                          ▼                                            ▼
                              summary tables (Postgres,                    near-real-time counters (Redis)
                              read-replica-served)                          "today so far", live tiles
                                          │
                                          ▼
                              Reporting API (BFF)  ->  Admin & Seller dashboards, CSV/XLSX exports
```

- **Never query OLTP order/ledger tables directly for dashboards.** Reports read
  **pre-aggregated summary tables** (`report_daily_product`, `report_daily_seller`,
  `report_daily_category`, `report_daily_campaign`, `report_daily_finance`, …),
  served from a **read replica**. Ad-hoc / high-cardinality analysis goes to a
  columnar warehouse later (ClickHouse/BigQuery — deferred, `01`/`21` P4).
- Summary tables are partitioned by date, keyed by (date, dimension ids), with
  additive measures so ranges are simple `SUM`s.
- Rollups are **idempotent and reprocessable** — a day can be recomputed from
  `raw_event` + domain history if logic changes or late data arrives.

## 4. Freshness & correctness

- **Provisional vs final**: "today" and the current period are labeled
  *provisional* (from hourly rollups + Redis counters). A period is marked
  *final* after day-close + payment reconciliation (`13` §8).
- **Restatement**: a refund/cancellation/chargeback is attributed to the period
  of the **original order** (net sales for last month can change when a return
  lands this month). Reports show "net (as of {date})" and a changelog of
  restatements for closed periods.
- **Money must tie to the ledger.** A CI/periodic check asserts
  `Σ report_daily_finance == ledger` for each closed period; drift raises an
  alert and blocks finalization (`18` §9).
- Timezone: rollup day boundary is a configured business timezone; seller reports
  can display in the seller's timezone with a clear label.

## 5. Delivery / UX

- Dashboards: overview tiles (period + delta), time-series charts, breakdown
  tables with drill-down, comparison mode (period vs period), saved views.
- **Exports**: any table → async job → CSV/XLSX in object storage → download link
  + email (never a blocking request, `06` cross-cutting).
- **Scheduled reports**: seller/admin can schedule a weekly/monthly email digest
  or export.
- Charts follow the `dataviz` skill conventions when built; consistent with the
  design system (`CODING-RULES.md` §G, admin = denser).
- All labels/units via i18n + `Intl` (`24`).

## 6. Event schema governance

- Every trackable interaction is a **registered event type** with a Zod schema in
  `@shopnetic/contracts` (name, required props, PII policy). Adding a feature that
  should be measurable = register its events (checklist item, like notifications
  in `15`).
- Client events are sampled/batched; server/domain events are authoritative for
  anything money- or outcome-related.
- Bot/self/internal traffic filtered before rollups (`27` §3).

## 7. Privacy

- Seller/admin reports are **aggregates**; no buyer PII in report outputs.
- Cohort/segment reports use non-identifying buckets (new vs returning, region,
  device class), gated by consent for anything user-level.
- Raw event retention per `20` §5; summary tables kept long-term (small).
- Per-user analytics (for personalization, `27`) are a separate consented store,
  not exposed in business reports.

## 8. Phasing

| Phase | Reporting |
|-------|-----------|
| MVP (P2) | Event capture + domain events flowing to `raw_event`. Core daily rollups: sales, units, GMV, refunds, payouts by product/seller/day. Seller dashboard: sales, orders, top products, low stock. Admin: GMV, orders, refunds, top sellers/categories, moderation/onboarding counts. CSV export. Money ties to ledger. |
| P3 | Full funnel & traffic reports, campaign/coupon ROI, inventory analytics, cohorts, scheduled digests, comparison mode, more dimensions. |
| P4 | Columnar warehouse for ad-hoc/self-serve analytics, forecasting, anomaly detection, seller benchmarking ("you vs category median"). |

## Changelog

- 2026-08-31 — Initial draft.
