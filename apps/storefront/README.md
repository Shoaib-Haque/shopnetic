# @shopnetic/storefront

Buyer / guest storefront. Next.js (App Router, RSC/SSR/ISR).

## Run

```bash
pnpm --filter @shopnetic/storefront dev     # http://localhost:3000  → /en
pnpm --filter @shopnetic/storefront build
```

## Layout (see `plan/23-project-structure.md`)

- `src/app/` — routing only, thin. `[locale]/(public)` is guest-visible & indexable.
- `src/features/<domain>/` — domain UI + actions + schema.
- `src/components/` — generic, no domain logic. `providers/root-provider.tsx` is the
  one client provider leaf.
- `src/proxy.ts` — Next 16 middleware (locale now; auth gate later).
- `messages/en/*.json` — i18n catalogs (`plan/24`). No hard-coded user-facing strings.

## Skeleton scope

One localized home page + a client `BrowseButton` leaf that demonstrates the
Server-Component-page / client-leaf split and the `Button` loading state. No
catalog, no data.
