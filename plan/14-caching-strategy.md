# 14 — Caching Strategy

Status: DRAFT
Related: `10-seo-strategy.md`, `08-api-design.md`, `11-search-and-catalog.md`

## Principle

Cache aggressively where data is public and slightly stale is fine (catalog);
never cache anything user-specific or money-related. Every cache entry has an
explicit **owner**, **key**, **TTL**, and **invalidation trigger** — no "just add
a cache" without those four.

## 1. Cache layers (outermost → innermost)

| Layer | Scope | What it holds | Invalidation |
|-------|-------|---------------|--------------|
| **CDN edge** | Global | Static assets, images, ISR HTML for public pages, public catalog GET responses | Immutable-hashed assets: forever. HTML/API: `s-maxage` + **tag purge** on domain events |
| **Next.js Data/Route cache** | Per app instance | `fetch` results with `revalidate` + `tags`; ISR page output | `revalidateTag()` / `revalidatePath()` from a BFF webhook fed by events |
| **Application cache (Redis)** | Per service | Hot read models: product detail aggregate, buy-box, category tree, facet config, seller public profile, homepage blocks, feature flags | Event-driven delete/replace + short TTL safety net |
| **In-process (LRU) cache** | Per pod | Tiny, very hot, rarely changing: category tree, currency/tax config, JWKS, permission definitions | Short TTL (30–60s) + pub/sub bust |
| **DB / ORM** | — | Prisma query engine; Postgres shared buffers | n/a |
| **Search engine** | — | Denormalized product read model (itself a cache of Postgres) | Indexer pipeline (`11`) |
| **HTTP client cache** | Between services | `ETag` / `Cache-Control` on internal GETs | Conditional requests |

## 2. What is cacheable vs never

| Cacheable (public) | Never cache |
|--------------------|-------------|
| Product detail (title, media, specs, aggregate rating) | Cart contents |
| Category tree & listing pages (canonical, no per-user facets) | Checkout session, quotes, tax |
| Search & autocomplete (short TTL, by normalized query) | Orders, payments, ledger, payouts |
| Seller public profile & rating | Account/profile/addresses/payment methods |
| Homepage / CMS blocks | Notifications, messages |
| Price *ranges* and buy-box (short TTL) | Admin/seller panel data (unless explicitly public) |
| Static assets, fonts, product images | Anything requiring an `Authorization` header |
| `robots.txt`, sitemaps (regenerated) | Stock exact counts at checkout (always live) |

Authenticated API responses: `Cache-Control: private, no-store`. Enforced by a
Nest interceptor that fails loudly if a handler behind auth sets a public cache
header.

## 3. Key design

- Namespaced, versioned: `v3:product:{productId}:detail:{locale}` — bump the
  `v{n}` prefix to invalidate a whole class on schema change (no mass delete).
- Include every input that changes output: locale, currency, region (for
  shipping-inclusive price), maybe device class. Do **not** include user id in a
  "public" key — if you need to, it isn't public.
- CDN cache tags: `product-{id}`, `category-{id}`, `seller-{id}`, `home`,
  `sitemap` — attached as `Cache-Tag` / `Surrogate-Key` response headers; purged
  by id on events.

## 4. TTLs (starting points — tune from hit-rate + staleness tolerance)

| Entry | TTL | SWR / grace |
|-------|-----|-------------|
| Product detail aggregate (Redis) | 5 min | serve stale 1h while revalidating |
| Buy-box / price range | 60 s | 5 min |
| Category tree | 10 min | 1h |
| Facet config | 30 min | 1h |
| Search results (by query) | 30–60 s | 5 min |
| Autocomplete | 5 min | — |
| Seller public profile | 10 min | 1h |
| Homepage / CMS | 5 min (ISR) | on-demand purge |
| Feature flags / config | 30–60 s | — |
| JWKS | 1h | refetch on unknown `kid` |
| Static hashed assets | 1 year `immutable` | — |
| Images (CDN) | 30 days | revalidate on key change |

## 5. Invalidation model (event-driven, not time-hope)

```
domain event (product.updated, offer.price_changed, review.published,
              cms.published, seller.profile_updated, category.moved)
        │
        ├─► Redis: DEL / SET new value for affected keys
        ├─► Next: POST /internal/revalidate { tags: ["product-123"] }  → revalidateTag
        └─► CDN: purge by Cache-Tag ("product-123")
```

- **Write-through** for cheap-to-compute hot values (buy-box) — recompute and
  `SET` on the event.
- **Delete-on-write** for expensive aggregates — next read repopulates.
- TTL is only a *safety net* for missed events, never the primary mechanism.
- Bulk events (seller bulk price import) → coalesce/debounce purges per entity.

## 6. Stampede / thundering-herd protection

- **Single-flight / request coalescing**: first miss acquires a short Redis lock
  (`SET NX PX`), computes, populates; concurrent requests wait briefly or get
  stale.
- **Stale-while-revalidate**: serve the expired value, refresh in the background.
- **Jittered TTLs**: ±10% randomization so keys don't all expire together.
- **Negative caching**: cache 404s briefly (30s) to stop hammering on missing
  slugs (bots probing).
- Pre-warm: after a full search reindex or deploy, warm homepage + top-N PDPs.

## 7. Consistency expectations (write these into the UX)

- Catalog/pricing on public pages may be up to ~1 min stale — acceptable.
- The moment a user hits **add-to-cart / checkout**, we bypass caches and read
  live price + stock; the cart re-prices against source of truth.
- Order/payment/inventory-at-checkout: **always** strong-consistent reads.
- Search can lag catalog by seconds — the PDP (less cached) is the source of
  truth the user lands on.

## 8. Redis specifics

- Separate logical databases / key prefixes per concern: `cache:`, `session:`,
  `ratelimit:`, `queue:` (BullMQ), `socket:` (adapter), `lock:`.
- `maxmemory-policy allkeys-lru` for the cache instance; **separate instance**
  (no eviction) for queues/sessions/rate-limit so cache pressure can't drop jobs.
- Client: connection pool, timeouts, `enableOfflineQueue: false` on hot paths so
  Redis being down degrades to DB reads instead of hanging.
- Redis down = degraded, not outage: fall back to DB/search with tighter rate
  limits and a metric spike alert.

## 9. Anti-patterns to forbid

- Caching per-user data under a shared key.
- Using TTL as the only invalidation.
- Caching inside a DB transaction / caching then not handling the "source
  changed mid-request" case.
- Unbounded in-process caches (memory leak) — always LRU + max size.
- Caching error responses (except short negative cache for 404).
- Different services caching the same derived value with different TTLs and no
  shared bust — centralize the read model instead.

## 10. Metrics

Hit ratio per cache/key-class, miss latency, stampede-lock waits, stale-serve
count, purge lag (event → CDN purged), Redis memory/evictions, ISR revalidation
duration. Alert on hit-ratio drop (usually a bad deploy or broken invalidation).
