# 11 — Search & Catalog

Status: DRAFT
Related: `07-data-model.md`, `02-architecture.md`, `26-catalog-options-variants-brands.md`, `27-merchandising-and-ranking.md`

> Full option/variant/brand/media modeling and all corner cases:
> **`26-catalog-options-variants-brands.md`**. Result **ordering / ranking** on
> home, category, and search shares its signal set and event pipeline with
> **`27-merchandising-and-ranking.md`** — section 6 below is the search-specific view.

## 1. Catalog modeling recap

- **Category** tree (ltree `path`); per category, admin configures which
  **Option Types** apply (required/optional, variant-forming or attribute) and
  the value source — see `26` section 2.
- **Product** = shared catalog concept (localized title/description, brand
  optional, spec jsonb), owned by Catalog context, moderated.
- **Variant/SKU** = one combination of one Option Value per the product's chosen
  Option Types (0..n axes); modeled as `variant` + `variant_option_value` rows,
  **not** a JSONB blob in the source of truth (`26` section 3).
- **Brand** is optional per product depending on `category.brand_requirement`;
  sellers can propose unlisted brands via `brand_request` (`26` section 6).
- **Offer** = a seller's price+stock+condition for a SKU (Inventory context).
- A PDP shows one Product, its variants, and all active Offers with a **buy-box**
  winner.

### Why Product/Offer split

Prevents catalog pollution (10 sellers of the same phone = 1 PDP, not 10),
enables price comparison, concentrates SEO equity, and lets ranking/buy-box logic
compare sellers fairly.

### Catalog governance (keeps quality up)

- Sellers attach to existing Products freely (create an Offer).
- New Product / edits to shared fields → `product_edit_request` → Catalog
  moderation (Admin) → approve/merge/reject.
- Duplicate detection on title + brand + gtin at submission time.
- Attribute validation against category schema at write time.

## 2. Search engine choice

| Option | Verdict |
|--------|---------|
| **OpenSearch / Elasticsearch** | Target. Facets, custom relevance, synonyms, analyzers, geo, aggregations, scale. More ops. |
| **Meilisearch / Typesense** | Great DX, typo-tolerance out of the box, fast to ship. Use for **MVP**, migrate if relevance/scale needs outgrow it. |
| Postgres FTS | Fine for admin/internal search; not for storefront relevance/facets. |

**Plan**: MVP on Meilisearch (or OpenSearch if the team is comfortable), behind a
`SearchService` interface so swapping is a driver change, not a rewrite.

## 3. Index design (read model — rebuildable, not source of truth)

One primary index `products` (denormalized document per Product, or per
Variant if variant-level facets/pricing matter — likely **per Variant** so
size/color filters and price ranges work):

```
{
  variantId, productId, slug,
  title, brand, brandSlug,
  categoryId, categoryPath: ["electronics","electronics/laptops"],
  attributes: { color: "black", ram_gb: 16, ... },
  priceMin, priceMax, currency,           // across active offers
  onSale, availability: "in_stock",
  sellerIds: [...], sellerCount,
  bestSellerId, buyboxPrice,
  ratingAvg, ratingCount,
  popularity, salesRank, createdAt,
  isActive, isAdult, restricted
}
```

- Separate indexes later: `sellers`, `categories`, `suggestions` (query
  autocomplete), `synonyms`.
- Per-locale index when i18n lands.

## 4. Indexing pipeline

Event-driven, eventually consistent:

```
Catalog/Inventory/Reviews events  ──►  RabbitMQ  ──►  Indexer worker (BullMQ)
   (product.updated, offer.price_changed, offer.stock_changed,
    review.published, product.approved, offer.suppressed)
                                          │
                                          ▼
                              build/patch document ──► Search engine bulk API
```

- **Debounce/coalesce** rapid changes per variant (e.g. bulk price import) into
  one reindex.
- **Full reindex** job (scheduled weekly + on-demand) rebuilds from Postgres via
  a stable cursor; zero-downtime via alias swap (`products_v2` → alias
  `products`).
- Backfill/repair job compares counts + checksums, fixes drift.
- Indexer is idempotent; out-of-order events resolved by `updatedAt`/version.
- DLQ + alert on indexing failures; stale-document age metric.

## 5. Query features

| Feature | Notes |
|---------|-------|
| Full-text | Title, brand, category, key attributes, synonyms. Weighted fields (title > attributes > description). |
| Typo tolerance | 1–2 edits by term length; not on very short tokens. |
| Autocomplete / suggestions | Prefix index on titles + popular queries; category & brand suggestions; returns fast (<50ms). |
| Facets / filters | Category, brand, price range, rating, attributes (per category), availability, seller, condition, on-sale. Counts shown. |
| Sorting | Relevance (default), price ↑/↓, rating, newest, best-selling. |
| Pagination | Cursor/`search_after`; cap deep pages. |
| Synonyms & stopwords | Managed list, editable by Admin (e.g. "laptop"="notebook"). |
| Redirects / curation | Admin can pin results or redirect a query ("gift card" → landing page). |
| "Did you mean" / zero-results | Spellcheck suggestion + relaxed query + popular fallback. |
| Personalization (later) | Boost by user's category affinity; keep as a re-rank layer. |

## 6. Relevance & ranking

Base text score, then business boosts (tunable, config not code):
- In-stock ≫ out-of-stock (near-exclude OOS from default view).
- Seller quality (health score), product rating & review count.
- Popularity / sales velocity (time-decayed).
- Price competitiveness for the query intent.
- Freshness for "new" intent.
- Penalize high cancellation/return rate sellers.
- Never let paid placement silently override — sponsored results (future) are
  labeled and slotted.

A/B test ranking changes; log query → results → clicks → conversions for offline
evaluation (nDCG). Guard against feedback loops (popular gets more popular).

## 7. Buy-box algorithm (which offer is default on PDP / used in search price)

Score offers on: price (incl. shipping to a default region), seller health,
handling time, stock, rating, return rate. Highest wins; ties broken by price then
recency. Recomputed on offer change; cached in `buybox`. Show "N other offers
from $X".

## 8. Category browse vs search

Same query backend; category browse = filtered query on `categoryPath` with
category-specific facet config and (optionally) a curated default sort +
merchandised pins.

## 9. Operational concerns

- Search service is **independently scalable** (read-heavy, spiky) — first
  extraction candidate.
- Circuit breaker: if search is down, storefront falls back to a Postgres-backed
  "browse by category" + cached popular lists, with a banner.
- Index size/shard planning; snapshot backups (even though rebuildable — faster
  recovery).
- Query logging (sampled) → analytics: top queries, zero-result queries (feed
  merchandising & synonym list), latency percentiles.
- Protect against scraping: rate-limit, no full-catalog dump via pagination.

## 10. Open questions (→ `22`)

- Variant-level vs product-level index (leaning variant-level).
- Meilisearch vs OpenSearch for launch.
- How much personalization in v1 (leaning: none beyond recently-viewed boosts).
