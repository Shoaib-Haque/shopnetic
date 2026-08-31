# 09 — Frontend Architecture

Status: DRAFT
Related: `10-seo-strategy.md`, `01-tech-stack.md`, `08-api-design.md`,
`23-project-structure.md` (exact folder layout), `24-i18n-localization.md`,
`28-page-loading-and-rendering.md` (progressive rendering), `CODING-RULES.md`

## 1. Apps

| App | Domain | Rendering default | Auth |
|-----|--------|-------------------|------|
| `storefront` | `www.shopnetic.com` | SSR/ISR, CDN-cached public pages | optional |
| `seller` | `seller.shopnetic.com` | SSR `no-store` + CSR islands | required (SELLER) |
| `admin` | `admin.shopnetic.com` | CSR-heavy dashboard, SSR shell | required (staff) |

All three consume `@shopnetic/ui` (shadcn + Tailwind + shared tokens) so buyer
and seller/admin share one visual language — same components, denser spacing
preset for back office. One theme config, CSS variables, light/dark.

Monorepo: `apps/storefront`, `apps/seller`, `apps/admin`, `packages/ui`,
`packages/contracts`, `packages/config`.

## 2. Next.js App Router structure (storefront)

```
app/
  (marketing)/            # cached, public
    page.tsx              # home (ISR)
    c/[...slug]/page.tsx  # category browse (ISR + searchParams for facets)
    p/[slug]/page.tsx     # product detail (ISR, generateMetadata, JSON-LD)
    s/[shop]/page.tsx     # seller storefront
    search/page.tsx       # SSR (query-driven, not cached per query)
  (shop)/                 # dynamic, private-ish
    cart/page.tsx         # client-driven, no-store
    checkout/...          # server actions + client steps, no-store
  (account)/              # auth required, no-store
    orders/...
    profile/...
  api/                    # BFF route handlers (compose service calls)
  layout.tsx              # header/footer, providers
  not-found.tsx / error.tsx / global-error.tsx
```

- **RSC by default.** Client components only for interactivity (add-to-cart,
  facet toggles, carousels, forms). Keep the client bundle small.
- **Server Actions** for mutations from server-rendered forms (checkout steps,
  profile) with progressive enhancement; TanStack Query mutations for rich
  client flows (cart).
- **Streaming + Suspense**: shell + above-the-fold first, stream reviews /
  recommendations / "other offers".
- `generateStaticParams` for top categories/products; rest ISR on-demand.
- `revalidateTag`/`revalidatePath` wired to catalog/price events via a BFF
  webhook so ISR pages refresh when data changes.

## 3. Data layer

- **Server**: fetch from BFF with `fetch` + `next: { revalidate, tags }`. Typed
  client generated from OpenAPI (`@shopnetic/contracts`).
- **Client**: TanStack Query; query keys mirror resource URLs; optimistic updates
  for cart/wishlist; global error + auth-refresh interceptor.
- **Auth on client**: access token in memory, refresh via httpOnly cookie +
  silent refresh; 401 → refresh once → retry → else redirect to login preserving
  `returnTo`.
- No secrets or service URLs in client bundle; everything via BFF.

## 4. State management

| State kind | Where |
|------------|-------|
| Server cache (products, orders) | TanStack Query / RSC fetch cache |
| URL state (facets, sort, page, tab) | `searchParams` — shareable, SSR-friendly |
| Ephemeral UI (modals, drawers) | local `useState` / small context |
| Cross-cutting session (user, cart count, locale) | lightweight context hydrated on load; Zustand only if it grows |
| Forms | React Hook Form + Zod resolver (schema shared with API) |

Avoid a global store as a dumping ground. Prefer server state + URL state.

## 5. Design system & UX standards

- Tokens: color, spacing, radius, typography, shadow, z-index, breakpoints — one
  source, consumed by Tailwind preset.
- Components: Button, Input, Select, Combobox, Dialog, Sheet, Toast, Table,
  Pagination, Tabs, Badge, Card, Skeleton, EmptyState, Form primitives,
  DataGrid (admin), FileUpload, PriceTag, RatingStars, AddressForm.
- Every list view ships **loading (skeleton), empty, error, and partial** states.
- Accessibility: WCAG 2.2 AA — keyboard paths for all flows, focus management in
  dialogs, `aria-live` for cart/price updates, form errors linked to inputs,
  color-contrast tokens, `prefers-reduced-motion`, visible focus rings.
- Feedback: toasts for async results; inline errors for forms; optimistic UI with
  rollback + toast on failure.

## 6. Responsive / device strategy

- **Mobile-first** Tailwind breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`.
- Layout primitives (Container, Grid, Stack) not ad-hoc media queries.
- Touch targets ≥ 44px; sticky add-to-cart bar on mobile PDP; bottom-sheet
  filters on mobile vs sidebar on desktop.
- Admin/seller: usable down to tablet; below that, focused task views (approve,
  reply, mark shipped) rather than full data grids.
- Images: `next/image`, responsive `sizes`, AVIF/WebP, LQIP placeholders, lazy
  below the fold, priority for LCP image.
- Test matrix: iOS Safari, Android Chrome, desktop Chrome/Firefox/Safari/Edge.

## 7. Performance budgets (storefront; enforced in CI via Lighthouse-CI)

| Metric | Budget (mobile, p75) |
|--------|----------------------|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| TTFB (SSR) | ≤ 600ms |
| JS shipped (route, gzip) | ≤ 170KB initial |
| Image weight (PDP) | ≤ 500KB above the fold |

Techniques: RSC, route-level code splitting, `next/dynamic` for heavy client
widgets, font `display: swap` + preload + subset, third-party scripts deferred /
partytown, no layout shift (reserved media boxes), edge caching.

## 8. Error handling & resilience

- `error.tsx` per segment; `global-error.tsx` fallback; friendly copy + retry +
  support link; report to Sentry with `requestId`.
- Distinguish: not-found (404 page), forbidden (redirect/login), offline
  (retry banner), degraded (show cached + "some data may be stale").
- Never render a raw exception. Never block the whole page for one failed widget
  — Suspense boundary + local fallback.
- Form submissions: disable double-submit, show pending, surface field + form errors.

## 9. Internationalization readiness

- `next-intl`; all user-facing strings via `t()` from day one, even single-locale.
- Formatting via `Intl` (number, currency, date, relative time).
- No string concatenation for sentences; ICU message format for plurals/gender.
- `dir` attribute wired for future RTL; logical CSS properties (`ms`/`me`).
- Locale-independent slugs + `hreflang` scaffolding (see `10`).

## 10. Testing (see `19`)

- Unit/component: Vitest + RTL for logic-bearing components.
- Contract: FE typed client validated against OpenAPI in CI.
- E2E: Playwright critical journeys — browse→PDP→cart→checkout→order,
  seller add-offer→receive order→ship, admin approve seller.
- Visual regression: Playwright screenshots / Chromatic on `@shopnetic/ui`.
- a11y: `axe` in component tests + Playwright.

## 11. Frontend conventions

- Colocate: `component.tsx`, `component.test.tsx`, `component.stories.tsx`.
- Server vs client boundary explicit (`'use client'` only where needed).
- No data fetching in `useEffect` on the server-renderable path.
- Absolute imports via workspace aliases; no deep relative `../../..`.
- ESLint rules: no direct `fetch` to service URLs from client, no `any`,
  exhaustive deps, RSC/`use client` lint plugin.
