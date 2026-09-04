# 27 — Merchandising & Ranking (Home, Category, Recommendations)

Status: DRAFT
Related: `11-search-and-catalog.md`, `30-reporting-and-analytics.md`, `28-page-loading-and-rendering.md`, `14-caching-strategy.md`

Covers: what shows first on the landing page and category pages, how it's
ordered, and the "customers also viewed" / "related to this item" sections.
Search-result ranking proper lives in `11` section 6 — the signal set and event pipeline
here are shared with it.

## 1. Principles

1. **Capture everything, decide later.** Log every impression, click, add-to-cart,
   purchase, review, dwell — from day one — even before we have smart ranking.
   You can't backfill behavioral data.
2. **Layered, not a single sort.** A page is a blend of *candidate generators* +
   *scoring* + *personalization re-rank* + *diversity/exploration* + *curated
   pins* + *sponsored slots*. Never "ORDER BY sales DESC" alone — that starves the
   long tail and freezes the catalog.
3. **Every product gets impressions.** Deliberate exploration + rotation +
   category diversity so new and niche products are discoverable, not just the
   current winners.
4. **Start heuristic, evolve to learned.** v1 is transparent rules; v2 adds
   collaborative filtering; v3 a learned ranker. Each is A/B tested.
5. **Personalization is consented and graceful.** Works fully for anonymous users
   on popularity + context; better when signed in; degrades to popularity if the
   personalization service is down.

## 2. Signals (collected for every product / variant / seller)

| Group | Signals |
|-------|---------|
| Exposure | impressions (by surface + position), unique viewers |
| Engagement | PDP views, clicks, CTR, dwell time, image/video opens, add-to-cart, add-to-wishlist, share |
| Conversion | orders, units, revenue (GMV), conversion rate, cart→order rate |
| Velocity | sales in last 24h / 7d / 30d, trend (accelerating/decelerating), time-decayed |
| Quality | rating avg, rating count, review recency, return rate, cancellation rate, dispute rate, "item not as described" rate |
| Seller | seller health score, on-time-ship %, response time, fulfilment reliability |
| Catalog | price, price competitiveness vs similar items, discount depth, in-stock %, media completeness, spec completeness, age since listing |
| Context | category, brand, attributes, price band, season/campaign tags |
| Per-user (signed in / consented) | category affinity, brand affinity, price-band affinity, recently viewed, past purchases, wishlist/follows, search history, location/serviceability |
| Business | sponsored bid (future), campaign membership, strategic-category boost, margin/commission tier |

All are **read models** built by rollup jobs from the raw event stream (section 3) +
transactional events (`order.placed`, `review.published`, `offer.stock_changed`).

## 3. Event capture pipeline (shared with `30`)

```
Browser/App  ──emit──►  /api/events (BFF, batched, sampled for high-freq)
      │                       │  validates (Zod), stamps ts + session + (userId|anonId)
      │                       ▼
      │                 event stream (RabbitMQ topic / Kafka later)
      │                       ├─► raw_event store (append-only, partitioned by day)   -> analytics / reprocessing
      │                       ├─► rollup workers (hourly + daily)  -> ranking_features_* tables
      │                       └─► near-real-time counters (Redis)  -> "trending now", live dashboards
```

- Client sends: `impression` (with surface + slot + productIds visible),
  `product_click`, `pdp_view`, `add_to_cart`, `search`, `filter_apply`,
  `media_open`, `dwell` (on unload). Batched, `navigator.sendBeacon`, sampled for
  impressions.
- Server enriches with `order`, `refund`, `review`, `return` events from the
  domain bus — never trust the client for money/outcome signals.
- Bot / self-traffic filtered (seller viewing own product, known crawlers,
  velocity anomalies) before rollups.
- Privacy: per-user signals keyed by `userId` only with consent; otherwise
  `anonId` (rotating, no cross-site), and used only for session-local context.
  Honor "do not personalize".

## 4. Candidate generators (the pools a page draws from)

Each is a query/job producing a ranked-ish list of productIds with a reason tag:

| Generator | Definition |
|-----------|------------|
| `best_sellers_7d` / `_30d` | Top by time-decayed units/GMV in a window, per scope (global or category) |
| `trending_now` | Highest acceleration in views/sales over the last few hours (Redis counters) |
| `top_rated` | High rating + enough reviews + low return rate |
| `new_arrivals` | Recently listed, within a boost window, quality-gated |
| `deals` | Active discount ≥ threshold, or campaign members, budget remaining |
| `for_you` | Personalized: items in the user's affinity categories/brands/price band not yet purchased |
| `because_you_viewed_X` | Co-view / content-similar to a recently viewed item |
| `buy_again` | Consumable/repeat-purchase items from order history |
| `category_you_browsed` | Best of a category the user engaged with this/last session |
| `back_in_stock` / `price_drop` | From the user's wishlist (`29`) |
| `seasonal` / `campaign` | Admin-curated tag sets, scheduled |
| `explore_tail` | Randomized sample of quality-gated, under-exposed products (fairness) |
| `curated` | Admin hand-picked pins for a slot |
| `sponsored` | Paid placements (future), labeled, fixed slots |

## 5. Scoring

Within a generator's candidates, `score = Σ (weight_i × normalized_signal_i)`,
weights **in config (feature flags / a tunable table), not code**. Starting shape:

```
score =  w_relevance   * text/context match         (search & category only)
       + w_quality      * (rating, review_count, low return/cancel/dispute)
       + w_velocity     * time_decayed_sales
       + w_conversion   * pdp_view→order rate
       + w_freshness    * recency (with new-item boost window)
       + w_price_comp   * price competitiveness for the context
       + w_seller       * seller_health
       + w_personal     * user affinity match          (0 if not personalized)
       - p_oos          * out_of_stock / low_stock
       - p_incomplete   * missing media / specs
       - p_penalty      * policy flags, high complaint rate
```

- All signals normalized (percentile or z-score within the candidate set) so no
  single raw count dominates.
- **Never** let `sponsored` or `margin` silently reorder organic results —
  sponsored items occupy declared, labeled slots only.
- Recompute on a schedule (features) + on strong events (went OOS, big price
  change) invalidate the cached slice.

## 6. Assembling a page (blend layer)

### Home / landing

- Home = an ordered list of **rails**, each rail = (generator, scope, size,
  layout). Example default set: `hero/campaign` → `for_you` (or `trending_now`
  for anon) → `deals` → `best_sellers_7d` → `category_you_browsed` →
  `new_arrivals` → `top_rated in {affinity category}` → `explore_tail` →
  category-grid.
- Rail selection itself is config + light personalization (anon users get
  popularity/deals rails; signed-in users get `for_you`, `buy_again` first).
- **De-dup across rails**: a product shown in one rail is suppressed from later
  rails on the same page.
- **Diversity within a rail**: cap items per seller (e.g. ≤ 2), per brand, spread
  across sub-categories; interleave rather than showing 10 near-identical items.
- **Exploration**: reserve a fraction of slots per rail (e.g. 10–15%) for
  `explore_tail` / new items, chosen with ε-greedy or Thompson sampling so we
  gather signal on cold items. Rotate on refresh so repeat visits look alive.
- **Freshness/rotation**: seed randomization with `date + userId` so it's stable
  within a short window (cacheable, `28`) but changes through the day.
- Curated pins and campaign rails always win their declared slots.

### Category page

- Default sort = the blended score scoped to that category (not raw popularity).
- Explicit sorts available (price, newest, rating, best-selling) — user choice
  overrides the blend.
- Same diversity + exploration rules; sub-category interleaving so browsing
  "Electronics" isn't 40 phone cases.
- Facets from `11` section 5.

### Caching

Anon home/category slices are CDN+Redis cached per (segment, category, sort,
page, rotation-bucket) for a short TTL (`14`). Signed-in `for_you`/`buy_again`
rails render server-side per user, `no-store`, short Redis memo keyed by userId.

## 7. "Customers who viewed this also viewed" & "Related to this item"

Two distinct sections on the PDP (both from the shared event data):

| Section | Method | Fallback (cold start) |
|---------|--------|-----------------------|
| **Customers who viewed this item also viewed** | Item–item **co-view** matrix: for product X, other products most frequently viewed in the same sessions, lift-adjusted (normalize by overall popularity so blockbusters don't dominate). Batch job nightly + incremental. | Content similarity: same category + brand + shared attributes + near price band. |
| **Customers who bought this also bought / frequently bought together** | Item–item **co-purchase** matrix (higher signal, sparser). "Frequently bought together" = co-purchase within the same order; "also bought" = across orders. | Co-view matrix, then content similarity. |
| **Products related to this item** | Content-based: same leaf category, shared brand/attributes, similar price, quality-gated; light personalization re-rank (boost user's affinity brands). | Category best-sellers. |
| **More from this seller** | Seller's other active products, best first. | — |
| **Compare with similar items** | Same category, overlapping attributes, price within ±X%. | — |

Storage: precomputed `product_related (product_id, related_product_id, kind,
score, rank)` refreshed by jobs; served straight from the read model (fast, no
runtime ML). Exclude OOS / suppressed / same-product-different-variant / already
in cart. Cap per seller. Refresh cadence: co-view/co-purchase nightly (incl.
incremental hourly for hot items); content-similarity on catalog change.

## 8. Guardrails

- **Feedback-loop dampening**: exploration slots + normalize by exposure so
  "popular because we showed it" doesn't run away. Track Gini/coverage of
  impressions across the catalog as a health metric.
- **New-item boost**: time-boxed (`freshness` weight) so new listings get a fair
  trial, then must earn their place.
- **Exclusions everywhere**: OOS, `under_review`, `suppressed`, not serviceable
  to the user's region, adult/restricted without gate, seller on vacation.
- **Per-seller / per-brand caps** in any single view.
- **No repeats** across rails on one page; limited repeats across sessions.
- **Sponsored** clearly labeled, fixed slots, never blended into organic order,
  quality floor still applies.
- **Personalization off-switch** honored; anon = context + popularity only.
- **A/B framework**: every weight change / new generator ships behind an
  experiment with guardrail metrics (conversion, GMV, diversity, complaint rate).
- **Explainability** (internal): each shown product carries its `reason` tag +
  score breakdown in logs for debugging "why did this show".

## 9. Phasing

| Phase | Ranking capability |
|-------|--------------------|
| MVP (P2) | Event capture live. Heuristic score (velocity + rating + freshness + price + in-stock) + admin curated pins + `explore_tail` random. Home = a few static-config rails. Related = content-similarity only. |
| P3 | Rollup feature store; co-view & co-purchase matrices → "also viewed / also bought"; `for_you` v1 (affinity); diversity + exploration tuning; A/B framework. |
| P4 | Learned ranker (gradient-boosted / two-tower) trained on logged signals; session-aware personalization; sponsored placements. |

## Changelog

- 2026-08-31 — Initial draft.
