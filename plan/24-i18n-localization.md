# 24 — Internationalization & Localization

Status: DRAFT
Related: `CODING-RULES.md` §L, `09-frontend-architecture.md`, `10-seo-strategy.md`, `26-catalog-options-variants-brands.md`

**Launch: English only.** But every screen, message, email, and error is built on
the i18n layer from day one so adding a locale later is config + translation, not
a refactor. This is a hard rule (`CODING-RULES.md` §L).

## 1. Two kinds of "text" — never confuse them

| Kind | Source | Mechanism | Missing-value behavior |
|------|--------|-----------|------------------------|
| **UI copy** — labels, buttons, headings, helper text, empty states, toasts, **error & validation messages**, email/PDF templates, `alt`/`aria`/`placeholder`, enum display names | Written by us | **Message catalogs** (`messages/<locale>/<ns>.json`), accessed via `t('ns.key')` | dev/CI: build fails. prod: visible fallback + log |
| **Content** — product titles/descriptions, category & option names, brand names, CMS pages, seller shop text, review text, buyer names | Entered as data by sellers/admins/buyers | **Localized DB fields** (`{ "en": "...", "bn": "..." }` JSONB or a `*_translation` table) | fall back to the default-locale value |

Numbers, prices, dates, quantities are neither — they are formatted through
`Intl` (§6), not translated.

## 2. Library & routing

- **`next-intl`** (App Router integration; server + client; ICU MessageFormat).
- **All routes are locale-prefixed**: `/[locale]/...`. Launch serves `/en/...`;
  the root `/` redirects to the default locale. `proxy.ts` (middleware) resolves
  locale in this order: path prefix → user preference (cookie, if logged in) →
  `Accept-Language` → default. It only *redirects* on the bare root; it never
  rewrites content language away from the path.
- `generateStaticParams` includes `locale`. ISR pages are cached per locale.
- Supported-locale list is one config (`packages/i18n/config.ts`); adding `bn`
  later = add to the list + ship `messages/bn/*` + translate content fields.

## 3. Message catalog structure

```
apps/<app>/messages/
  en/
    common.json         # buttons, generic labels, nav
    errors.json         # every error/validation message, keyed by error code
    validation.json     # field-level rules ("email.invalid", "qty.max")
    checkout.json
    product.json
    seller.orders.json
    email.order-shipped.json
    ...
```

- **One namespace per feature area**; matches `features/<domain>` folders.
- Keys are semantic, hierarchical, English-free identifiers:
  `product.variant.outOfStock`, not `product['This option is sold out']`.
- Shared/global strings live in `common.json`; do not duplicate a string across
  namespaces — reference `common`.
- Email/PDF templates are namespaces too (`email.*`) — subject + body keys.
- A generated `messages.d.ts` gives `t()` autocomplete + compile-time key
  checking. Referencing a non-existent key is a type error.

## 4. Error & validation messages are localized

This is the part teams usually get wrong. Our contract:

1. The **server never returns a human sentence** as the primary error. It returns
   the `08` §4 envelope: a stable machine `code` (`CART_ITEM_OUT_OF_STOCK`) plus
   structured `params` (`{ max: 5, available: 2 }`).
2. `errors.json` maps each `code` → an ICU message:
   `"CART_ITEM_OUT_OF_STOCK": "Only {available} left — reduce the quantity."`
3. The client renders `t(\`errors.${code}\`, params)`. One shared
   `renderApiError(error)` helper does this everywhere.
4. Zod schemas (shared, `@shopnetic/contracts`) carry **message keys**, not
   English: `z.string().email({ message: 'validation.email.invalid' })`. A shared
   resolver turns keys → `t()` on the client and → the same catalog on the server
   (for API responses and emails).
5. Fallback: unknown `code` → `t('errors.generic')` + log the code so we add it.

Result: a French user gets a French "only 2 left" without a single code change.

## 5. Localized content fields (seller/admin-authored)

For catalog/CMS data that must be translatable:

- **Approach A (default now):** a JSONB column `name jsonb` holding
  `{ "en": "Cotton T-Shirt" }`. Read via a `localized(field, locale)` helper that
  falls back to default locale, then to any present value.
- **Approach B (when translation volume is high / needs workflow):** a
  `product_translation(product_id, locale, name, description, …)` table with a
  unique `(product_id, locale)`. Chosen per entity in `25`/`26`.
- Launch stores only `en`. The helper and schema already accept a map, so adding
  `bn` is a data operation.
- Option names, option values, category names, attribute labels, brand display
  names → same treatment (`26`). Slugs stay locale-independent at launch;
  per-locale slugs + `hreflang` come with multi-locale (`10` §6).
- Seller UI: at launch, one input per field (implicitly `en`). Later: a
  locale switcher per field, default-locale required, others optional.

## 6. Formatting — always through `Intl`

- Money: `formatMoney({ amount, currency }, locale)` — **never** string-concat a
  symbol. Amount stays integer minor units end to end (`07` §Principles).
- Numbers, percentages, dates, times, relative time ("2 days ago"), lists
  ("A, B, and C"), units → `Intl.*` via shared helpers in `@shopnetic/i18n`.
- Timezone: store UTC, display in the user's zone; scheduling (payouts, quiet
  hours, campaign start) is timezone-aware.
- Pluralization/gender/ordinals: ICU MessageFormat only
  (`{count, plural, one {# review} other {# reviews}}`). No `count === 1 ? ...`.
- Bidi: use CSS logical properties (`margin-inline-start`), set `dir` from the
  locale, so RTL works later without a rewrite.

## 7. Server vs client

- Server Components and server actions get `t` from `getTranslations()` (request
  locale). Most copy renders on the server → good for SEO and no flash.
- Client leaf components get `t` from the `NextIntlClientProvider` mounted once in
  the root layout's client provider leaf; only the namespaces a route needs are
  sent to the client (keep the payload small).
- The active locale is available to both; client code never picks copy language
  from `navigator.language` (`CODING-RULES.md` §L5).

## 8. SEO (ties to `10`)

- `<html lang>` set from the route locale.
- Per-locale metadata + JSON-LD (translated), per-locale canonical, `hreflang`
  cluster + `x-default` once >1 locale.
- Per-locale sitemaps.
- Localized `og:locale`.
- At launch (1 locale) this is scaffolding that emits the single-locale correct
  values.

## 9. Workflow & tooling

- **Extraction check** in CI: scan for `t('…')` usages → assert every key exists
  in `messages/en/*`; assert no orphan keys; **fail on any bare user-facing
  string literal in JSX / throw / toast** (custom ESLint rule + `eslint-plugin-
  i18next`-style check).
- Translators work on `messages/<locale>/*.json` (or a TMS export/import). `en` is
  the source of truth; a CI job flags keys present in `en` but missing in other
  locales.
- Pseudo-locale (`en-XA`) available in dev to catch untranslated strings and
  layout breakage from longer text.
- No key deletion without checking usage; renaming a key is add-new +
  migrate-usages + remove-old in one PR.

## 10. Checklist for any new UI (subset of `CODING-RULES.md` §K)

- [ ] No literal user-visible string anywhere — all via `t()`.
- [ ] Error path returns a `code` + params; message added to `errors.json`.
- [ ] Validation schema uses message keys, not English.
- [ ] Any new seller/admin-authored field is a localized field, not a plain column.
- [ ] Numbers/money/dates go through `Intl` helpers.
- [ ] Plurals via ICU.
- [ ] New namespace file created if it's a new feature area.
