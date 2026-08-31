# 28 — Page Loading & Rendering Strategy

Status: DRAFT
Related: `09-frontend-architecture.md`, `10-seo-strategy.md`, `27-merchandising-and-ranking.md`, `CODING-RULES.md` §C/§E

How each page type loads: what renders first, what streams in, how lists paginate,
and how "sections only appear if they have data".

## 1. Global approach

- **Server-render the meaningful content**, stream the rest (Next App Router +
  React Suspense). The user sees product name, image, price fast; heavier
  sections fill in.
- **One skeleton per streamed region**, shaped like the final content → no layout
  shift (CLS budget `09` §7).
- **Progressive, not blocking**: a slow "related items" query must never delay the
  buy box.
- Client JS is for interaction only; navigation between pages keeps server
  rendering (`CODING-RULES.md` §C).

## 2. Product Detail Page (PDP) — progressive sections

Render order (each later group in its own `<Suspense>` boundary, streamed):

| Priority | Region | Data source | Notes |
|----------|--------|-------------|-------|
| **1 — in initial HTML, blocking** | Breadcrumbs, title, brand, primary image (LCP), price / buy-box, variant pickers, rating summary, key attributes, primary CTA, canonical + metadata + `Product`/`Offer` JSON-LD | Single server fetch `getProductView(slug, variantId)` from the PDP read model (denormalized, `26` §3) | Must be fast: read model is pre-joined; target TTFB `20` §1. Above-the-fold is complete without JS. |
| **2 — streamed, high** | Full image/video gallery (beyond first image), full description, spec table, delivery/returns panel | Same read model / lazy media list | Gallery thumbnails lazy; first image `priority`. |
| **3 — streamed** | Reviews & ratings (first page), Q&A | Reviews service | Paginated; "see all" → own route or client load-more. |
| **4 — streamed, low** | "Customers also viewed", "Also bought / frequently bought together", "Related to this item", "More from this seller", "Compare similar" | `product_related` read model (`27` §7) — precomputed, fast | Each its own boundary; independent failure (one erroring section shows nothing, page fine). |
| **5 — client, after hydration** | "Recently viewed" (personal), live stock ticker, "N people viewing", personalized re-rank of section 4 | Client fetch / realtime (`15`) | Never blocks; hydrates in. |

- **Variant change** (pick a color): updates price, gallery, stock, buy-box via a
  client action that refetches just the variant slice (or uses already-loaded
  variant data) — **no full page reload**, URL updated to `?v=` via
  `history.replaceState` / router `replace` (shallow). Gallery swap uses the
  media-resolution rules in `26` §5.
- **Deep link `?v=`**: server resolves the variant and renders section 1 for it
  directly (SEO-accurate).

## 3. Optional sections — "no data, no section"

Not every product has a spec table, videos, Q&A, size chart, "frequently bought
together", etc.

- `getProductView` returns a `sections` descriptor: which sections have content
  (`{ description: true, specs: false, videos: true, qa: false, alsoBought: true, … }`).
- The page renders a section **only if** its flag is true. No empty heading, no
  "No data available" placeholder, no reserved empty space.
- Streamed sections (group 4) that resolve to an empty list render **nothing**
  (the Suspense fallback is replaced by empty → collapse the boundary).
- Order of present sections is fixed; absent ones are skipped, siblings move up.
- Admin/seller PDP preview shows which optional sections are missing so they can
  fill them (drives completeness score in `27` signals).

## 4. Listing pages (category, search results, "see all")

Hybrid pagination — SEO-safe first, then progressive:

1. **First page: SSR**, real content in HTML, with **real `<a href>` numbered
   pagination** in the markup (crawlable, `10` §1/§10) even though it's visually
   secondary.
2. After the first page, a **"Load more" button** appends the next page (client
   fetch, keeps scroll position, updates URL `?page=` via shallow replace).
3. After 1–2 manual "Load more", switch to **auto-load on scroll** (Intersection
   Observer) for a bounded number of additional pages.
4. **Hard stop** at a cap (config, e.g. **10 pages / ~240 items**): show
   "Showing 240 of 5,312 — refine your filters or go to page N" with a link to
   deeper numbered pages (still server-rendered, still crawlable). Prevents
   infinite-scroll perf death + crawl traps.
5. **Back navigation** restores scroll position and already-loaded items
   (cache the list in `sessionStorage` keyed by the URL, or Next's router cache).
6. Each product card: image lazy (except first row `priority`), fixed aspect
   ratio box (no CLS), skeleton grid while a page loads.
7. Facet change / sort change = new query = back to step 1 (fresh SSR-ish load,
   `no-store` for search, ISR for clean category — `10`).

## 5. Home / landing page

- **Shell + first 1–2 rails SSR** (hero/campaign + `trending`/`for_you`) in the
  initial HTML.
- Remaining rails each in a `<Suspense>` boundary, **streamed** — each rail is an
  independent server fetch of its candidate generator (`27` §4), so a slow rail
  doesn't hold the page.
- Rails with no candidates render nothing (§3 rule).
- Personalized rails for signed-in users render server-side per request
  (`no-store`, short per-user memo); anon rails come from the short-TTL cached
  slice.
- Horizontal rail contents lazy-load off-screen items on scroll within the rail.

## 6. Cart / checkout / account

- `no-store`, SSR the current state, minimal streaming (these are small).
- Cart: server-render lines + totals; quantity/remove are client actions with
  optimistic update + rollback (`CODING-RULES.md` §E2) and server re-price.
- Checkout steps: server components per step; the interactive bits (address form,
  payment element) are client leaves; never block a step on an optional lookup
  (e.g. "estimated delivery" streams in).

## 7. Images & media

- `next/image` everywhere; responsive `sizes`; AVIF/WebP; **LQIP/blur placeholder**
  from a stored tiny base64 or a blurhash on `media_asset`.
- LCP image (`priority`, preloaded): first gallery image on PDP, hero on home,
  first card row on listings.
- Everything else lazy, with a reserved box (width/height or aspect-ratio) so
  nothing shifts.
- Video: poster image first, `preload="none"`, play on interaction.
- Variant gallery swap: preload the selected variant's first image on swatch
  hover/focus for instant switch.

## 8. Prefetch & perceived speed

- Prefetch likely next navigations (Next `<Link>` prefetch on viewport/hover) for
  category → PDP and pagination.
- Optimistic route transitions with a top progress bar; keep the old page
  interactive until the new one is ready (`loading.tsx` per segment as fallback).
- Skeletons match final layout; avoid spinners for full-page loads (skeleton),
  use spinners for in-place actions (`CODING-RULES.md` §E4).

## 9. Budgets & guardrails (enforced, `09` §7)

- Above-the-fold PDP/home/category usable without JS.
- No `<Suspense>` boundary may wrap primary content (title/price/first image).
- Streamed section count per page kept sane (≤ ~6) to limit connection overhead.
- Infinite scroll always has the hard cap + crawlable deep pagination.
- Lighthouse-CI gate on LCP/INP/CLS per template; a PR that regresses a template
  fails.

## Changelog

- 2026-08-31 — Initial draft.
