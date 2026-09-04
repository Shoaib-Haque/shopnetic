# 10 — SEO Strategy

Status: DRAFT
Related: `09-frontend-architecture.md`, `14-caching-strategy.md`,
`24-i18n-localization.md` (locale routing, hreflang), `28-page-loading-and-rendering.md`
(crawlable pagination vs infinite scroll)

SEO is a hard requirement (organic traffic is a marketplace's cheapest
acquisition channel). This file is the rulebook.

## 1. Rendering rules per page type

| Page | Strategy | Cache | Indexable |
|------|----------|-------|-----------|
| Home | ISR (revalidate ~5m) | CDN | yes |
| Category / browse | ISR + on-demand revalidate on catalog events | CDN, vary on path only (not on every facet combo) | yes (canonical = clean category URL) |
| Product detail (PDP) | ISR + on-demand revalidate on product/price/stock events | CDN | yes |
| Seller storefront | ISR | CDN | yes |
| Search results | SSR, `no-store` | none | `noindex, follow` (thin/duplicate) |
| Faceted category (filters applied) | SSR | none | `noindex, follow` unless a curated facet page |
| Cart / checkout / account / seller / admin | SSR `no-store` | none | `noindex, nofollow` |
| Static (about, help, policies) | SSG | CDN | yes |

**Faceted navigation control** is the classic marketplace SEO trap:
- Canonical tag on filtered category pages → the base category URL.
- `noindex, follow` on arbitrary filter combinations.
- Promote a *small curated set* of high-value facet pages (e.g.
  `/c/shoes/running`) to real indexable pages with unique copy.
- `rel="next"/"prev"` deprecated by Google; rely on canonical + internal links;
  keep pagination crawlable (real `<a href>`), not JS-only.

## 2. URL design

- Human, stable, lowercase, hyphenated: `/p/nike-air-zoom-pegasus-41`,
  `/c/electronics/laptops`, `/s/acme-store`.
- Slug is immutable-ish; on change, **301** old → new; keep a slug-history table.
- No tracking params in canonical; strip `utm_*` server-side for canonical.
- Trailing slash policy: pick one (no trailing slash), enforce with redirect.
- IDs not required in URL; if used, keep slug primary and 301 id-only forms.

## 3. Metadata (Next `generateMetadata`)

Per PDP/category/seller: unique `<title>` (≤ 60 chars, pattern
`{Product} — {Brand} | Shopnetic`), `meta description` (≤ 155, generated from
product summary, deduped), canonical, Open Graph (title, description, image,
`og:type=product`), Twitter card, `robots` directives per table above.

## 4. Structured data (JSON-LD, server-rendered)

| Page | Schema |
|------|--------|
| PDP | `Product` + `Offer`(s) (price, availability, condition, priceValidUntil, shippingDetails), `AggregateRating`, `Review`, `Brand` |
| PDP | `BreadcrumbList` |
| Category | `BreadcrumbList`, `ItemList` (product links) |
| Seller | `Store`/`Organization` + `AggregateRating` |
| Site | `Organization` + `WebSite` with `SearchAction` (sitelinks search box) |
| Help articles | `FAQPage` / `Article` where apt |

Rules: only mark up content visible on the page; keep prices/availability
accurate (feeds Google Merchant-style rich results); validate in CI with a
schema linter.

## 5. Crawl & index infrastructure

- **XML sitemaps**, segmented and indexed:
  `sitemap-index.xml` → `sitemap-products-{n}.xml` (≤ 50k URLs / ≤ 50MB each),
  `sitemap-categories.xml`, `sitemap-sellers.xml`, `sitemap-static.xml`.
  Generated from DB, regenerated on a schedule + incremental on publish events.
  Include `lastmod`. Submit via Search Console + `robots.txt` reference.
- **`robots.txt`**: allow catalog; disallow `/cart`, `/checkout`, `/account`,
  `/api`, `/search` (or allow search but rely on noindex), seller/admin subdomains
  fully disallowed. Reference sitemap index.
- **HTTP status hygiene**: real 404 for missing products (not soft-200);
  410 for permanently removed; 301 for slug/category moves; 200 only for live.
- **Discontinued product page**: keep the URL live with `Product` +
  `availability: Discontinued`, show alternatives/other offers — don't 404 away
  accumulated link equity unless truly gone.
- **Out-of-stock**: stay indexable, structured data `availability:
  OutOfStock` (or BackOrder), show restock/alternatives.
- Internal linking: breadcrumbs, related products, "more from this seller",
  category cross-links, HTML sitemap page for humans.

## 6. Internationalization SEO (future-proof now)

- Locale in path (`/en/...`, `/de/...`) when multi-locale lands; single locale
  now at root but code the route group so it's a config flip.
- `hreflang` cluster + `x-default` per translated URL.
- Per-locale sitemaps; currency/price localized; translated metadata & JSON-LD.

## 7. Performance = ranking (Core Web Vitals)

Budgets enforced (see `09` section 7). LCP image `priority` + preload; fonts subset +
preload; no CLS (reserved media/ad slots); minimal blocking JS; edge SSR; HTTP/2
or /3; `Cache-Control` + CDN for public pages. Monitor field data (CrUX / RUM),
not just lab.

## 8. Content & duplication

- Canonical always self-referential on the preferred URL.
- Same product sold by many sellers = **one** PDP (canonical), seller offers are
  sections, not separate URLs.
- Manufacturer-copy duplication: encourage/augment unique descriptions; add
  Q&A, reviews, spec tables to increase unique content.
- Pagination pages: `noindex,follow` beyond page 1 OR self-canonical with unique
  intro — decide per template; never canonical page N → page 1.
- Thin seller stores / empty categories: `noindex` until they have content.

## 9. Monitoring

- Google Search Console + Bing Webmaster: coverage, enhancements (Product,
  Breadcrumb), CWV, manual actions, sitemap status.
- Log-file / crawl-budget analysis quarterly: where Googlebot spends time
  (kill crawl traps).
- Alerts on: sudden index drop, spike in 404/5xx to Googlebot, canonical
  mismatch, structured-data errors, robots.txt fetch failure.
- Pre-deploy checks in CI: metadata present, canonical present, JSON-LD valid,
  no `noindex` on money pages, sitemap builds.

## 10. Anti-patterns to forbid (lint / review checklist)

- Client-only rendering of primary content on indexable pages.
- Infinite scroll with no crawlable pagination fallback.
- `noindex` accidentally shipped on PDP/category (CI guard).
- Blocking JS/CSS needed for main content in `robots.txt`.
- Session IDs / filter combos in canonical URLs.
- 302 where 301 is meant.
- Soft 404s (200 status on "not found" content).
