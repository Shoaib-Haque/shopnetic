# 26 — Catalog: Options, Variants, Stock, Media & Brands

Status: DRAFT
Related: `07-data-model.md`, `11-search-and-catalog.md`, `05-features-seller.md`, `06-features-admin.md`, `25-database-conventions.md`

**Build progress:** built so far — `brand` (+ `brand_alias`, section 6); the global
`option_type` / `option_value` catalog (section 3); `value_set` (+ `value_set_item`,
section 2.1); `category_option` (section 2.1) as an upsert at
`PUT /admin/v1/categories/:categoryId/options/:optionTypeId`; `product`
(+ `product_option`, `product_option_value`, `variant`, `variant_option_value`,
section 2.2–2.3) — admin CRUD at `/admin/v1/products`, `…/:id/options/:optionTypeId`
(+ `/values`), `…/:id/variants`; **`media_asset` + `media_option_tag` (section 5)**
for `product` owners — `/admin/v1/products/:productId/media`, `/admin/v1/media/:id`
(+ `…/tags/:optionTypeId`), one tag per axis per asset, reordering, and cover photo
semantics; and **`offer` / `stock` / `warehouse` / `buybox` (section 1, section 7)**
for admin inspection, offer lifecycle management, multi-warehouse stock allocations,
and live Buy-Box winner competition — `/admin/v1/offers`, `…/:id/restore`,
`…/variants/:variantId/buybox`, `/admin/v1/stock/levels`, `/admin/v1/warehouses`.
Admin CRUD also at `/admin/v1/brands`, `/admin/v1/option-types`, `/admin/v1/value-sets`.
`data_type` ships as `select|text|number|bool|swatch` (`select` in place of this doc's `enum`).
Variant selections are immutable and cover exactly the `is_variant_axis` product
options; `combo_signature` blocks duplicate combinations.
**Deferred:** `brand_request` (section 6); seller-side self-service listings (`apps/seller`),
moderation queue for seller-proposed option types/values, per-category media rules (min/max,
aspect ratio) and render-time gallery resolution (section 5).
**Flagged from 2026 Master Architectural Blueprint (Missing in Current Implementation):**
Batch/lot/expiry tracking, FIFO/LIFO/FEFO inventory valuation, standardized continuous measurement
units & unit-price calculations, backorders/pre-orders, shadow draft versioning for live active
product updates, 3-tier update sensitivity classification, automated media transcoding pipelines (WebP/AVIF/HLS),
360-spin/3D assets, a formal product/fulfillment class taxonomy (physical vs. digital vs. service vs.
bundle), and pre-cart personalization attributes (see Section 9.1).

This is the hardest modeling problem in the platform. Reference screenshots:
`tmp/amazon/amazon_shirt_options.png` (Color + Size + pack qty), `tmp/amazon/amazon_iphone_options.png`
(Storage + Color + Carrier + Grade, with unavailable combos), `tmp/amazon/amazon_headphone_options.png`
(single Color + "see other options", 9 videos), `tmp/amazon/amazon_search.png` (facets),
`tmp/amazon/amazon_categories.png` (category tree).

**Yes, a relational DB handles all of this cleanly.** JSONB is used only for the
denormalized read model (PDP/search), never as the source of truth.

---

## 1. Vocabulary (use these words everywhere)

| Term | Definition | Example |
|------|------------|---------|
| **Option Type** | A named axis of choice, scoped to a category. | `Color`, `Size`, `Storage`, `Carrier`, `Grade` |
| **Option Value** | An allowed value of an Option Type. | `Red`, `Large`, `256GB`, `Verizon` |
| **Product** | The shared catalog concept (title, description, brand, category). | "Cotton King Crew Neck T‑Shirt" |
| **Product Option** | Which Option Types *this* product actually uses, and in what order. | This shirt uses `Color`, `Size`. That phone uses `Storage`, `Color`, `Carrier`. |
| **Variant (SKU)** | One concrete combination of one Option Value per Product Option. Also the "no options" degenerate case (exactly one variant). | shirt `{Color: Sport Grey, Size: Large}` |
| **Offer** | A *seller's* sellable instance of a Variant: price, stock, condition, handling time. | Seller A sells that shirt variant for $14.99, 40 in stock |
| **Buy‑box** | The default winning Offer shown for a Variant when multiple sellers offer it. | `11` section 7 |

Key separation: **Options/Variants are on the Product (shared). Price/Stock are on
the Offer (per seller).** Media can attach to either, and can be tagged to Option
Values (section 5).

### 1.1 Governance: seller-proposed entities, admin moderation

**Decided:** a seller may *propose* an addition to any of four shared catalog
entities — **Brand**, **Product** (a new base product), **Option Value** (on an
`open`/`hybrid` axis), and **Option Type** (a whole new axis) — and every one of
them goes through the same shape: **seller proposes → admin reviews → approve**
(merges into the canonical/shared table, visible to everyone) **or reject**
(with a reason; seller notified). Nothing a seller proposes reaches the shared
catalog un-reviewed.

- **Already designed pre-existing:** Product (`product.proposed_by_seller_id`,
  Q14, `22`) and Brand (`brand_request` table + moderation queue, section 6) —
  Brand's queue is designed but not yet built (see this doc's "Build progress"
  note at the top).
- **Newly decided (2026-09-25):** Option Value and Option Type now follow the
  identical shape — this resolves Q26 and Q34 (`22`) as far as the *policy*
  question goes ("can a seller propose one, and is admin the gate" — yes, for
  both). Neither has any endpoint, table, or seller UI built yet.
- **Deliberately excluded: Category.** Sellers never propose categories, full
  stop — the tree stays 100% admin-only (`06` Catalog governance). The taxonomy
  is too structural (drives nav, facets, and every `category_option` config) to
  open up the way a brand or option value can be.
- **Still open (implementation, not policy):** whether one generalized
  `catalog_request` table (an entity-type discriminator + payload column) backs
  all four proposal types, or each gets its own typed table the way
  `brand_request` already does. Left to whoever builds the Option
  Value/Option Type moderation queues — doesn't change the seller/admin-facing
  behavior either way.

---

## 2. How options get configured — three levels

### 2.1 Admin — category level (`category_option`)

Admin curates, per category, the catalog of Option Types and how they behave:

| Field | Meaning |
|-------|---------|
| `option_type_id` | e.g. `Size` |
| `applicability` | `required` \| `optional` \| `not_applicable` — is a seller *forced* to use this on products in this category? |
| `is_variant_axis` | Does choosing a value create a distinct Variant/SKU (Size on a shirt) vs. just a spec (`Impedance` on headphones — an attribute, not a buyable choice)? |
| `value_source` | `predefined` (admin fixes the list: sizes S–3XL) \| `open` (seller can add values, subject to normalization/moderation: color names) \| `hybrid` (predefined + seller-proposed) |
| `position` | Display order on the PDP option picker |
| `price_impact` | `true` if values on this axis commonly change price (drives seller UI to prompt per‑variant pricing) |
| `value_set_id` | For predefined/hybrid: the managed list of values (e.g. "Apparel sizes") |

- Option Types themselves are global (`option_type`), reusable across categories,
  with a `data_type` (`enum` / `text` / `number` / `bool` / `swatch` — swatch =
  has a color/image chip).
- Admin also manages **Attributes** (non-variant facts: `Fabric type`, `Form
  Factor`, `Origin`). Attributes and non-variant Option Types overlap — treat
  `is_variant_axis = false` entries as attributes.
- Changing category option config is **additive-only** in practice (`25` section 1.1):
  you can add an optional Option Type, or add values to an `open`/`hybrid` set;
  you cannot remove one that existing products/variants use — deprecate instead.
- **Built today vs. decided:** `value_source: open`/`hybrid` only changes whether
  a product's chosen values must also fall inside the category's curated
  `value_set` (`predefined` requires it; `open`/`hybrid` skip that filter). Every
  value, on every `value_source`, must still already exist as an admin-managed
  `option_value` row — `assertValuesAllowed` in
  `apps/api/src/catalog/product-option.service.ts` enforces this with no
  exception. The seller-proposes-a-value half of `open`/`hybrid` (and, for a
  whole new axis, Option Type itself) is now a **decided** design — see
  section 1.1 — but **not built**: no endpoint, no moderation queue, no seller
  UI (there's no seller UI at all yet).

### 2.2 Seller — product level (`product_option`)

When a seller creates/claims a Product, they pick from the category's Option
Types:

- **`required`** category options must be included. If the product genuinely has
  no variation on that axis, the seller picks the single applicable value
  (a shirt that only comes in one size → `Size: One Size`; a phone with one
  storage → `Storage: 128GB`). There is always a value; "no choice" = one value.
- **`optional`** category options: seller includes them or not.
  - Shirt A → includes `Color` + `Size` (8 colors × 6 sizes).
  - Shirt B → includes neither → the product has exactly **one** variant, no
    picker shown.
  - Phone X → `Storage` + `Color` + `Carrier`.
  - Phone Y → `Size` only.
- The seller sets the **order** of options on the PDP (`product_option.position`).
- `not_applicable` category options can't be added.

### 2.3 Seller — variant level

From the chosen Product Options and their selected values, the seller generates
variants:

- The system offers the **Cartesian product** of selected values
  (`Color{Grey,Black,Blue} × Size{S,M,L}` = 9 rows).
- The seller **prunes** combinations that don't exist ("no Blue in S"). Pruned
  combos simply have no Variant/Offer.
- **Lazy creation**: a `variant` row is created only for combinations the seller
  actually offers. A 5×6×4 grid = 120 possible; if the seller stocks 30, there
  are 30 variants. This keeps the combinatorial blow-up bounded.
- Per variant the seller sets: **SKU code, price (or "same as base" + optional
  delta), sale price + schedule, stock per warehouse, GTIN/barcode, weight/dims,
  variant‑specific media selection** (section 5), status.
- Bulk: CSV/grid editor for the variant matrix (like a spreadsheet), with
  row-level validation and an async import job (`05` section 3).

---

## 3. Data model (relational)

```
option_type            (id, code, name_i18n, data_type, has_swatch)
option_value           (id, option_type_id, code, label_i18n, swatch_hex, swatch_image_key,
                        position, status)                     -- status: active|deprecated
value_set              (id, option_type_id, name, deleted_at)  -- e.g. "Apparel sizes", scoped to an option_type
value_set_item         (value_set_id, option_value_id, position)

category_option        (category_id, option_type_id, applicability, is_variant_axis,
                        value_source, value_set_id, price_impact, position)
                        PK (category_id, option_type_id)

product                (id, category_id, brand_id NULL, title_i18n, description_i18n,
                        slug, status, base_price_minor NULL, currency, spec jsonb,
                        proposed_by_seller_id, deleted_at)
product_option         (product_id, option_type_id, position, required_value_id NULL)
                        PK (product_id, option_type_id)
                        -- required_value_id set when the product uses this axis but has
                        --   exactly one value (the "One Size" case), lets UI skip the picker
product_option_value   (product_id, option_type_id, option_value_id, position)
                        -- the subset of values THIS product offers on THIS axis

variant                (id, product_id, sku_code, gtin NULL, weight_g NULL, dims jsonb NULL,
                        status, position, deleted_at)
variant_option_value   (variant_id, option_type_id, option_value_id)
                        PK (variant_id, option_type_id)
                        UNIQUE (variant_id, option_type_id)   -- one value per axis per variant
                        -- the set of rows for a variant IS its combination
  -- integrity: a UNIQUE hash/signature column on `variant` = ordered concat of
  --   (option_type_id:option_value_id) prevents duplicate combinations per product

offer                  (id, seller_id, variant_id, price_minor, sale_price_minor NULL,
                        sale_starts, sale_ends, compare_at_minor NULL, condition,
                        handling_days, min_qty, max_qty, status, deleted_at)
                        UNIQUE (seller_id, variant_id) WHERE deleted_at IS NULL
warehouse              (id, seller_id, name, address jsonb)
stock                  (offer_id, warehouse_id, on_hand, reserved, safety_stock,
                        backorder bool, restock_eta)
                        PK (offer_id, warehouse_id)
stock_ledger           (id, offer_id, delta, reason, ref_type, ref_id, created_at)
buybox                 (variant_id, winning_offer_id, computed_at)
```

Price resolution for a (seller, variant):
`offer.sale_price ?? offer.price ?? (product.base_price + variant delta)`.
Store the resolved `price_minor` on the offer to keep reads simple; recompute on
change. Different RAM/ROM/Color prices ⇒ different variants ⇒ different offer
rows ⇒ naturally different prices. **Price is per variant, never per option
value** (a "Red +$5" rule is just seed data for the grid editor, not a runtime
model).

### Why relational is enough

- Options, values, and the product's chosen subset are plain M:N joins.
- A variant *is* its set of `variant_option_value` rows — arbitrary number of
  axes (0, 1, 2, 3, …) with no schema change.
- Stock and price are per `offer` rows — per seller, per variant.
- Availability of a specific combination = "does a non-deleted `offer` with
  `stock.on_hand - reserved > 0` exist for the `variant` whose
  `variant_option_value` set matches the picked values".
- JSONB appears only in `variant`/`product` denormalized copy pushed to the PDP
  read model and the search index (`11` section 3) for fast rendering — rebuildable.

---

## 4. Buyer-facing selection UX

Mirrors Amazon's "twister":

1. PDP loads with a **default variant** selected (buy-box winner, or the one in
   the URL: `/p/slug?v=<variantId>` for shareable/indexable deep links).
2. One picker per `product_option` in `position` order. Swatch options render a
   color chip or thumbnail (`option_value.swatch_*`); others render buttons
   (`Small … 3X-Large`) or a dropdown (storage).
3. As the buyer picks values, the UI resolves the matching `variant` and updates
   price, media (section 5), stock badge, delivery estimate, buy-box.
4. **Partial availability** (iphone screenshot): a value that has **no
   in-stock/serviceable offer** given the current other selections is shown
   disabled/greyed with a reason ("Unavailable", "Can't ship to your address",
   "See other sellers"). Selecting it either switches to the nearest available
   combination or shows the "other sellers / no featured offer" panel.
5. If the product has **one variant** (no options chosen by seller) → no picker,
   just price + add to cart.
6. Add to cart stores the concrete `offer_id` + `variant_id` (+ snapshot), never
   just "product + options as text".
7. Deep link / SEO: canonical PDP is the product; each meaningful variant gets a
   `?v=` URL that sets the right selection server-side and emits variant-accurate
   `Offer` JSON-LD and metadata (`10` section 4). Not every variant is separately
   indexed — curated/representative ones only, rest `?v=` with canonical → base.

---

## 5. Media (photos + videos) — the critical part

Requirements: many images + videos per product; the *right* media shows for the
selected option value (pick White → see White photos); admin sets rules, seller
uploads, buyer sees/filters.

### Model

```
media_asset      (id, owner_type, owner_id, kind,           -- kind: image | video
                  file_key, poster_key NULL, width, height, duration_s NULL,
                  alt_i18n, position, status)
                  -- owner_type: product | offer
media_option_tag (media_asset_id, option_type_id, option_value_id)
                  -- 0..n tags. "this image is for Color=White (and Size=any)".
```

Rules:

- Media whose owner is **`product`** is shared catalog media (admin/first-seller
  curated, moderated). Media owned by **`offer`** is that seller's own shots for
  their listing (`offer_media` in `07`), lower trust, shown under "images from
  this seller".
- **Tagging**: a `media_asset` with **no** `media_option_tag` rows = default /
  applies to every variant. With tags on `Color=White` = shown when the selected
  variant's `Color` value is `White` (regardless of Size/other axes). Tags can be
  on more than one axis if needed (rare).
- **Resolution at render time** for a selected variant:
  1. media tagged to *all* of the variant's option values on tagged axes →
     "variant-specific gallery".
  2. fall back to media tagged to a subset (e.g. just `Color`) .
  3. fall back to untagged/default media.
  4. always include default media at the end so the gallery is never empty.
- **Videos** follow the exact same model (`kind = video`, `poster_key` for the
  thumbnail). "9 VIDEOS" in the headphone screenshot = 9 `media_asset` rows,
  `kind=video`, mostly untagged (brand/usage videos) — some can be color-tagged.
- The **swatch chip** itself is separate from the gallery: it comes from
  `option_value.swatch_hex` / `swatch_image_key` (a tiny representative image),
  set by admin for predefined values, by seller (pending normalization) for
  `open` values.
- **`file_key` today vs. later**: the S3/MinIO signed-upload pipeline (`01`
  section "File/media", Phase 1 "Media & Storage Pipeline" in `AGENTS.md`)
  isn't built yet, so there's nowhere to upload a file to. Until it lands,
  `file_key` holds a directly-renderable URL instead of an object-storage
  key — the admin's media dialog already renders it as a plain `<img src>`, so
  either shape works with no component change. Dev/CI seed data
  (`packages/db/prisma/seed/fixtures/seed-media.ts`) uses real, openly-licensed
  product photos served as static files from `apps/api/public/seed-media/`
  (wired via `app.useStaticAssets()` in `apps/api/src/main.ts`, dev-only) —
  the API's own origin, not any one app's `public/`, so admin, storefront,
  and seller can all render the same URL without a per-app copy. Migrating
  to the real pipeline later = upload those files (or re-fetch the
  originals — sources are documented in `seed-media.ts`) to the object store
  and swap the paths in that one file; `fixtures/inventory.ts` only ever
  references photos by category key, never by raw path.

### Who does what

| Actor | Media control |
|-------|---------------|
| **Admin** | Sets per-category media rules: min/max images, required angles, aspect ratio, max video length, whether video allowed, watermark/text policy. Curates/edits shared `product` media. Approves seller-proposed shared media. Moderation queue for all new media (auto image/text checks + human). Sets/edits swatch chips for predefined values. |
| **Seller** | Uploads `offer` media for their listing; may propose shared `product` media (→ moderation). Assigns `media_option_tag`s (marks which images are which color) via the variant/media manager. Reorders their gallery. Uploads a swatch image for a proposed `open` value. |
| **Buyer** | Sees the resolved gallery for the selected variant; can browse all media; thumbnails/`aria` from `alt_i18n`. Selecting a swatch swaps the gallery (no full reload — `28`). Filters "images from customers" vs "from seller" vs "from brand". |

### Corner cases

- Seller tags no images to a color that exists → that color falls back to default
  media (still valid, just not color-accurate). Warn the seller in the editor.
- Two sellers, same product, different `offer` media → PDP shows the buy-box
  seller's + shared media prominently; others under "from other sellers".
- Image fails moderation → stays `status = under_review`, not shown, seller
  notified; the offer can still be `under_review` overall (`05` section 3).
- Option value deprecated but old media tagged to it → media hidden with the
  value; not deleted.
- EXIF/GPS stripped, re-encoded, served from cookieless CDN domain (`16` section 4).

---

## 6. Brands

### Model

```
brand         (id, name, slug, display_name_i18n, logo_key NULL, status,
               merged_into_brand_id NULL, deleted_at)   -- status: pending|active|rejected
brand_alias   (id, brand_id, alias)                     -- "JBL", "jbl", "JBL Audio"
brand_request (id, seller_id, proposed_name, proposed_logo_key, evidence jsonb,
               status, reviewed_by, reject_reason, resulting_brand_id, created_at)
category      (... , brand_requirement)   -- required | optional | none
```

### Rules

- `product.brand_id` is **nullable**. Whether a brand is required depends on the
  category (`category.brand_requirement`): `Electronics` → required;
  `Handmade`/`Generic` → `none`; most → `optional`.
- Seller picks an existing `active` brand (typeahead over `brand` + `brand_alias`).
- **Seller wants an unlisted brand** → creates a `brand_request` (name, logo,
  proof: brand registry / authorization letter / website). The product can be
  submitted meanwhile:
  - product goes to catalog moderation with brand shown as "pending: {name}";
  - on **approve**: a `brand` row is created (`status=active`), the request's
    `resulting_brand_id` set, the product relinked, seller notified;
  - on **reject**: seller may pick a different/no brand or appeal; product stays
    in draft.
- **Deduplication**: on request and on admin review, fuzzy-match proposed name
  against `brand` + `brand_alias`; suggest the existing brand instead of creating
  a near-duplicate.
- **Merge tool** (admin): merge `brand B` into `brand A` → set
  `B.merged_into_brand_id = A`, add `B.name` as a `brand_alias` of A, relink all
  `product.brand_id` from B to A via a job, emit `brand.merged` (search reindex,
  cache purge). B kept (soft) for audit/redirects.
- **Remove a brand**: only via merge or, if truly unused, soft-delete with
  `product.brand_id → SET NULL` for any stragglers (`25` section 2.3). Brand storefront
  page then 410s/redirects.
- Restricted brands (counterfeit-prone) can be flagged so new listings under them
  need extra verification (`16` section 6). **Built today: only the flag itself**
  (`brand.is_restricted`, admin toggle) — no downstream moderation flow reads it
  yet, so flipping it currently has zero effect on products/listings under that
  brand (see `plan/CODING-RULES.md`, 2026-09-17 entry). What the "extra
  verification" should actually *do* once that flow exists — block new product
  add/edit under the brand until reviewed, allow submission but hold publish,
  or just flag existing listings for a queue — is undecided (Q31, `22`).
- Brand display name is a localized field; `name`/`slug` are canonical/latin for
  matching and URLs.

---

## 7. Admin vs Seller vs Buyer — capability matrix

Grid table (borders between every cell), matching `03-users-and-rbac.md`
section 4. `yes` = can do it; `—` = cannot / not applicable; a parenthetical
(e.g. `yes (own)`, `yes (→ moderate)`) narrows or qualifies it.

+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Capability                                                                               | Admin                 | Seller                     | Buyer                    |
+==========================================================================================+=======================+============================+==========================+
| Define Option Types & global value sets                                                  | yes                   | —                          | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Configure category options (required/optional, variant-axis, value source, price impact) | yes                   | —                          | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Add values to a `predefined` set                                                         | yes                   | —                          | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Propose a new value for an `open`/`hybrid` axis (e.g. a color)                           | yes                   | yes (→ normalize/moderate) | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Choose which options a product uses + their order                                        | yes (on base product) | yes (own products)         | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Choose which values a product offers per axis                                            | yes                   | yes                        | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Generate / prune variants                                                                | yes                   | yes (own)                  | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Set price / sale / stock per variant                                                     | —                     | yes (own offer)            | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Upload & tag media to option values                                                      | curate shared         | yes (own + propose shared) | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Set swatch chip for a value                                                              | yes (predefined)      | yes (proposed value)       | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Pick / propose brand                                                                     | yes                   | yes                        | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Approve brand requests, merge brands                                                     | yes                   | —                          | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Approve new base products / shared media / values                                        | yes                   | —                          | —                        |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Select options, see resolved variant/price/media/stock                                   | —                     | —                          | yes                      |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+
| Filter search by option facets (color, size, storage…)                                   | —                     | —                          | yes (see `11` section 5) |
+------------------------------------------------------------------------------------------+-----------------------+----------------------------+--------------------------+

Rows marked `yes (→ …)` for Seller on value/media proposals are **decided
design, not yet built** (section 1.1). There is no seller UI at all yet
(`apps/seller` is an empty scaffold), so nothing in this row is reachable in
practice today.

---

## 8. Corner cases checklist (design each before build)

- **Zero options**: product has no `product_option` rows → exactly one implicit
  variant; no picker; offer/stock/media all attach to that single variant.
- **Required category option, single real value**: use `required_value_id` on
  `product_option`; UI hides the picker but the variant still carries the value
  (keeps search facets + data consistent).
- **Combinatorial explosion**: lazy variant creation; grid editor caps
  (warn > N; hard limit configurable); search index is per-variant but
  deduplicates display (`11` section 3, section 10 open question).
- **Same product, different sellers, different option sets**: options live on the
  **product**, so all sellers share them. A seller who only stocks some
  combinations just creates fewer offers. A seller who needs a combination that
  has **no variant yet** → "request new variant" → moderation creates the
  `variant` (values already exist) → seller adds the offer. A seller cannot
  invent a *new option type* for a shared product directly — they **propose it,
  admin approves** (section 1.1), same shape as a new Brand or Product. Not
  built yet: no request table, no endpoint, no seller UI.
- **Two products that look similar but differ in options** (Shirt A with
  Color+Size, Shirt B with none): they are **different `product` rows** with
  different `product_option` config. They may share a category and brand. Do not
  try to force them onto one product.
- **Price varies by multiple axes** (RAM + ROM + Color): each combination is a
  variant with its own offer price. The grid editor lets the seller enter a base
  + per-axis deltas as a *convenience* that expands into per-variant prices.
- **Partial stock / partial serviceability** across combinations: per-variant
  `stock`; per-seller `serviceability` (`07` shipping) → UI disables unreachable
  combinations with a reason (iphone screenshot behavior).
- **Option value renamed / merged** (e.g. "Grey" → "Gray"): values are additive;
  rename via `label_i18n` edit (safe, it's display only) or merge two values with
  a job that repoints `variant_option_value` + `product_option_value` + media
  tags, then deprecate the loser.
- **Deprecating a value that variants use**: not allowed to hard-remove; set
  `status = deprecated` → hidden for new products, existing variants/orders
  unaffected, search stops faceting it once stock is 0.
- **Attribute vs option**: `Impedance: 32 ohm` (headphones) is
  `is_variant_axis = false` → an attribute row, shown in the spec table, filterable
  in search, not a buyable choice.
- **Pack quantity** ("Number of Items: 1 or 4" in the shirt screenshot): model as
  an Option Type `Pack Size` with `is_variant_axis = true` (distinct SKU, price,
  stock per pack size). Not a `quantity` hack.
- **Guest deep-links a variant that later goes away**: `?v=` resolves → if the
  variant is gone, fall back to the product's default variant + a notice.
- **Config change after products exist**: additive-only (`25`); adding an
  optional option type does not touch existing products; adding a value to an
  open set is safe; anything removing/narrowing is a deprecate + migrate job.

## 9. Open questions (→ `22`)

- Q6 (already listed): per-variant vs per-product search index granularity —
  this doc assumes **per-variant** with display dedupe.
- Grid-editor hard cap on variant count per product (proposed: warn 100, block
  500 — tune).
- **Decided** (section 1.1, 2026-09-25): sellers can propose new Option Values
  and new Option Types, gated by admin approval — same shape as Brand/Product.
  Still open, mechanism only: `open` color values as free text + normalization
  dictionary vs. a curated master palette sellers map onto (leaning: curated
  master palette + alias, so facets stay clean) (Q26); whether Option
  Value/Type proposals get their own typed request tables (mirroring
  `brand_request`) or one generalized `catalog_request` table (Q34) — a
  schema/implementation detail, not a product-policy question anymore.
- Whether sellers can ever create a brand directly once "trusted" (fast-track),
  or always via request (leaning: always request, faster SLA for trusted).
- **Product activation readiness gate** (Q36, flagged 2026-10-28): only
  category-required option axes are currently checked before a product can go
  `active` (`assertRequiredCategoryOptionsConfigured`); nothing checks for
  image/media presence, price presence, stock/offer presence, or that Variants
  were actually generated from the configured option values — a product can go
  fully Active today with zero photos, zero price, and zero stock. Real-world
  multi-vendor marketplaces (Amazon/Etsy/eBay) block publish until a baseline
  (photo + price + category-required attributes) is met; single-merchant
  platforms (Shopify/WooCommerce) don't. Deferred for decision after the
  current Products UI re-sweep and its fixes are complete — see `tmp/claude.txt`.

---

### 9.1 Master Architectural Blueprint (2026 Edition) Gap Analysis & Flagged Implementations

The following specifications from `plan/gemini/comprehensive_architectural_blueprint_2026_10_28.md` represent gaps in the current implementation of the Catalog, Stock, Pricing, and Media domains. These are formally flagged for subsequent implementation phases:

1. **[FLAGGED - Missing Implementation] Batch, Lot & Expiry Tracking (Blueprint Entity 7)**:
   - *Current State*: Stock is tracked only as a single aggregate quantity per warehouse (`WarehouseStock.onHand`, `allocated`, `reserved`).
   - *Blueprint Specification*: Physical tracking of distinct shipments with batch/lot numbers, manufacturing dates (`mfg_date`), and expiration dates (`expiry_date`) for perishable, pharmaceutical, and date-sensitive merchandise. Requires `catalog.stock_batch` table linked to `catalog.warehouse_stock`.

2. **[FLAGGED - Missing Implementation] Multi-Batch Price, Stock Prioritization & Cost Accounting (Blueprint Entity 7)**:
   - *Current State*: Single `basePriceMinor` on product and `priceMinor` on seller offer. Inventory depletion deducts from generic warehouse balances without cost accounting.
   - *Blueprint Specification*: Ability for merchants to manage multiple concurrent batches of the same SKU with distinct acquisition costs (COGS) and dynamic selling prices. Automated inventory depletion sequencing based on accounting policies: First-In-First-Out (**FIFO**), Last-In-First-Out (**LIFO**), or First-Expired-First-Out (**FEFO**).

3. **[FLAGGED - Missing Implementation] Standardized Measurement Units & Continuous Quantities (Blueprint Entity 1.7)**:
   - *Current State*: Discrete quantity integers only (e.g. 1 shirt, 2 laptops).
   - *Blueprint Specification*: Universal measurement unit framework supporting continuous physical quantities (weight: kg, g, lb, oz; volume: L, ml, fl oz; length: m, cm, in) and automated unit-price normalization (e.g. "$1.25 / 100g", "$0.18 / fl oz") displayed prominently on PDPs and search result cards for consumer transparency.

4. **[CORRECTED 2026-10-28 — largely already implemented, was mis-flagged] Backorders &
   Pre-Orders (Blueprint Entity 7)**:
   - *Current State*: Already built, not a gap. `Stock.backorder` (boolean) and
     `Stock.restockEta` (timestamp) exist (`packages/db/prisma/schema.prisma:976-977`),
     wired through `stock.service.ts` / `offer.service.ts`, directly drive Buy-Box
     eligibility (`buybox.service.ts`: `allowsBackorder = o.stocks.some((s) =>
     s.backorder)`), and have a working admin UI (Backorder toggle in
     `stock-adjust-modal.tsx`, "Backorder Available" badge in
     `product-offers-dialog.tsx`).
   - *Still genuinely open*: whether the **storefront** (buyer-facing PDP/cart)
     surfaces backorder status and the restock ETA to buyers and allows checkout on a
     backordered item — not verified either way; narrower in scope than the original
     flag implied.

5. **[FLAGGED - Missing Implementation] Shadow Versioning & Draft Copies for Live Product Updates (Blueprint Entity 8)**:
   - *Current State*: 3P product moderation operates on the initial submission (`pending` state). When an active product is edited, mutations either apply directly (in admin) or are blocked.
   - *Blueprint Specification*: When a merchant edits an active product, an isolated **Shadow Draft Copy** (`catalog.product_shadow_draft`) is generated. The live product remains publicly visible and buyable on storefronts without alteration while the proposed edits undergo moderation review. Upon admin approval, the shadow draft merges atomically into the live product record.

6. **[FLAGGED - Missing Implementation] Field-Level Sensitivity Classification for Product Updates (Blueprint Entity 8)**:
   - *Current State*: Monolithic review state where all fields on pending products are locked together.
   - *Blueprint Specification*: Risk-tiering matrix for product attribute changes:
     - *Tier 1 (Auto-Approved / Low-Risk)*: Stock allocations, inventory updates, minor typographical corrections, search tags.
     - *Tier 2 (Async Review / Low-Friction)*: Adding secondary gallery photos, expanding bullet points, updating non-critical care instructions.
     - *Tier 3 (Hard Block / Immediate Review)*: Title changes, category re-assignment, brand changes, price spikes (>30%), compliance or warranty disclosures.

7. **[FLAGGED - Missing Implementation] Automated Media Processing Pipelines & Transcoding (Blueprint Entity 12)**:
   - *Current State*: Media URLs are saved directly upon upload; video preview relies on standard raw MP4 files.
   - *Blueprint Specification*: Asynchronous BullMQ worker pipeline performing automatic thumbnail generation, format transcoding to modern web formats (WebP, AVIF), automated brand watermarking, and HLS/DASH adaptive bitrate transcoding for smooth video playback under constrained mobile networks.

8. **[FLAGGED - Missing Implementation] 360-Degree Spins & Interactive 3D Model Assets (Blueprint Entity 1.4, 18)**:
   - *Current State*: Media asset types are limited to `photo` and `video`.
   - *Blueprint Specification*: Ingestion and presentation of orbital 360-degree spin image frame sets and standardized 3D models (`.glb` / `.usdz`) rendered via `<model-viewer>` with orbital rotation and AR room projection.

9. **[FLAGGED - Missing Implementation] Global Brand Registry & Manufacturer Identification (Blueprint Entity 1.2)**:
   - *Current State*: Brands are tracked with name, slug, website, and text aliases (`brand_alias`).
   - *Blueprint Specification*: Standardized mapping of brands to authoritative global manufacturer registries, Manufacturer Part Numbers (MPN), and GTIN / UPC / EAN prefix ranges to enforce catalog harmonization and eliminate duplicate brand listings across multi-vendor imports.

10. **[FLAGGED - Missing Implementation] Multi-Country Regional Pricing & Tiered B2B Volume Pricing (Blueprint Entity 9)**:
    - *Current State*: Single `basePriceMinor`/currency on `Product` (base/reference
      price) and single `priceMinor` per `Offer` (the actual sellable price) — `Variant`
      itself carries no price field. No region or quantity-tier overrides at any level.
    - *Blueprint Specification*: Region-specific price overrides (e.g. different baseline pricing for US, UK, and EU markets) and quantity-based volume discount tiers (e.g., 1–10 units = $15, 11–50 units = $12, 51+ units = $10) configured at the offer level.

11. **[FLAGGED - Missing Implementation] Factory-to-Doorline Provenance Badges & Supply Chain Journey (Blueprint Differentiator 7, Plan 38)**:
    - *Current State*: Products track category, brand, options, variants, offers, and media assets; no supply chain origin or certification milestones are tracked.
    - *Blueprint Specification*: Verified supply chain timeline attached to products (`catalog.supply_chain_node`) detailing raw materials source, manufacturing facility certifications (BSCI, SMETA, ISO 14001, OEKO-TEX), quality assurance inspection, and domestic logistics routing, complete with audit documents and verified ESG badges on PDP headers.

12. **[FLAGGED - Missing Implementation, 2026-10-30] Formal Product/Fulfillment Class Taxonomy
    (`plan/gemini/GEMINI_PRODUCT_IMPLEMENTATION_REQUIREMENTS_2026_10_28.md` section 4)**:
    - *Current State*: Every variant is modeled as the same kind of physical good — `length_mm`/
      `width_mm`/`height_mm`/`weight_g` are present on every `Variant` row, and (as of the 2026-10-29
      Group 3 fix round, item 20) are now **required to be positive integers whenever provided**. There
      is no `product_class`/`fulfillment_type` field anywhere, and no notion of a digital/virtual SKU
      (skips warehouse allocation, issues an instant key/entitlement), a service/warranty SKU (logically
      attached to a physical SKU, fulfilled via voucher), or a bundle/kit SKU (atomically decrements
      stock from multiple *component* SKUs rather than carrying its own stock). Freight/landed-cost
      language exists only at checkout/tax time (`12`, `33`, `38`), never as a catalog-level
      classification the product/variant itself carries.
    - *Blueprint Specification*: A `ProductClass` enum (Standard Physical / Bulky-Freight / Digital &
      Virtual / Service & Warranty / Bundles & Kits / Multi-Packs) driving whether dims/weight are
      required at all, whether the item occupies warehouse stock, and how fulfillment is routed.
    - *Why this matters now, not just later*: the dims-positive validation added this session
      (`variantDimsSchema`, `packages/contracts/src/catalog.ts`) implicitly assumes every variant is a
      measurable physical object. That's correct for 100% of today's catalog, but is the kind of
      assumption that becomes a real bug the day a digital/service SKU is introduced without a
      corresponding class field to exempt it. Worth keeping in mind as a forward-compatibility note on
      that validation, not just a someday-feature.
    - Note: the *readiness matrix* in the source document above claims this domain is "**Implemented**
      (Dims > 0 validated, classes mapped)" — the dims-positive half is now true, but "classes mapped" is
      not; no such taxonomy exists in `packages/db/prisma/schema.prisma`. Flagging the overstatement here
      rather than editing that document, which stays as a frozen historical reference.

13. **[FLAGGED - Missing Implementation, 2026-10-30] Pre-Cart Personalization Attributes
    (`plan/gemini/GEMINI_PRODUCT_IMPLEMENTATION_REQUIREMENTS_2026_10_28.md` section 2.3)**:
    - *Current State*: No mechanism anywhere in the catalog, cart, or order-line schema for a
      buyer-supplied customization that doesn't generate a distinct SKU/variant (e.g. a laser-engraved
      name on a watch back, custom text/upload for a printed canvas). Every current purchasable
      distinction is modeled as a `Variant` (a real, pre-existing SKU row) or an `Offer` attribute — there
      is no "free-text/asset the buyer supplies at add-to-cart time, validated and preserved on the order
      line" concept.
    - *Blueprint Specification*: A per-product (or per-category-option) flag marking certain attributes
      as personalization inputs rather than variant axes; validated at the Cart API boundary (length
      limits, profanity/content checks, file-type/size limits for uploads) and copied verbatim onto the
      order line item at checkout (never re-derived later, same immutability principle as `32`'s Order
      Invariant).
    - *Scope note*: genuinely new — not a restatement of anything already flagged in this file or in
      `12-cart-checkout-orders.md`.

> **Readiness-matrix path corrections** (same source document as items 12–13, section 13 "Comprehensive
> Implementation & Readiness Matrix"): the matrix cites `plan/12-reviews-ratings.md` for Reviews &
> Q&A — that file is actually `12-cart-checkout-orders.md`; the real home is
> `35-reviews-ratings-and-disputes.md` (already a substantially fleshed-out spec, further along than
> "Planned" might suggest, though not yet implemented in code). It also cites
> `plan/28-search-recommendations.md` for Related Product Algorithms — `28` is actually
> `page-loading-and-rendering.md`; the real home is `27-merchandising-and-ranking.md` (collaborative-
> filtering co-purchase matrix already specced there), with the `pgvector`/semantic-embedding half of
> that domain covered separately in `37-artificial-intelligence-and-machine-learning.md`. Everything
> else in that document's 12 domains (structural hierarchy, option matrices, buy box, multi-warehouse,
> batch/lot, pricing, media, governance/shadow-drafts, search ranking/BM25) is already accurately
> reflected in this file, `32-catalog-lifecycle-and-product-guards.md` section 6, or
> `37-artificial-intelligence-and-machine-learning.md` — no further action needed there.

---

## 10. UI Tests Specification (Product & Sub-Features)

### Comprehensive Products UI Test Suite (Sorted & Grouped)

All Product UI tests are organized into functional feature groups in logical user-journey order. Error injection, artificial delay, and network resiliency tests are placed at the very end (Group 6).

```
Group 1: Base Product Management & Moderation Lifecycle
Group 2: Product Options Configuration & Governance
Group 3: Product Variants Matrix & Cartesian Generation
Group 4: Product Media Gallery & Variant Tagging
Group 5: Offers, Multi-Warehouse Stock & Buy-Box Management
Group 6: Network, Loading & Resiliency Tests (CDP Interception & .env Latency)
```

---

#### Group 1: Base Product Management & Moderation Lifecycle

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Desktop Products List & Grouped Filters Popover | `ProductList` (`/catalog/products`) | Navigate to `/catalog/products` on desktop viewport (1440×900). | Displays header, search bar (`/` shortcut), grouped `Filters` popover button with active filter counter badge, and product table with Origin (1P/3P) and Status badges (defaulting to 'All' status filter on initial load). | `tmp/catalog/products/01-products-desktop-list.png` |
| **1.2** | Grouped Filter Popover & Clear Action | `ProductList` filters popover | Click "Filters" trigger button; adjust Status ("Draft"), Origin ("In-House (1P)"), Category, or Brand. | Popover mounts grouped controls; list updates smoothly; active filter badge increments; "Clear filters" button clears secondary filters and resets to Active view. | `tmp/catalog/products/12-products-filters-popover-open.png` |
| **1.3** | Debounced Search & Relevance Ranking | `ProductList` token search | Type query into search input (e.g. "Cotton"). | 250ms debounced token search fires once typing settles without UI stutter or duplicate requests; token search matches and scores across product Title and Slug fields (prioritizing exact phrase and all-token matches), deliberately isolating description AST JSON from text queries. | `tmp/catalog/products/04-products-filter-and-search.png` |
| **1.4** | Create 1P Product Modal | `ProductFormModal` | Click **"+ Add Product"** button. | Opens `ProductFormModal` with autofocus on Title input, auto-slug generator preview, Category select, Brand select, Base Price, Currency, and default Draft status badge with explanatory hint. | `tmp/catalog/products/02-products-create-modal.png` |
| **1.5** | Save 1P Product & Highlighting | `ProductFormModal` → `ProductList` | Fill required fields and submit. | Modal closes, success toast fires; Base Price trims leading zeros on blur (e.g. `0000000` -> `0`, `0019.99` -> `19.99`); new product appears pinned at top of list with amber highlight tint via `useHighlightTarget`. | `tmp/catalog/products/03-products-created-row.png` |
| **1.6** | Category Locked Invariant on Edit | `ProductFormModal` (Edit mode) | Click "Edit" on an existing product in row menu. | `ProductFormModal` opens in edit mode; Category field is rendered as an immutable read-only badge with explanatory hint; Title, Brand, and Description remain editable. | `tmp/catalog/products/05-products-edit-modal-locked-cat.png` |
| **1.7** | 3P Vendor Proposal Moderation & Review Read-Only Mode | Moderation banner & actions (`ProductFormModal`) | Click "Review" on a 3P `pending_review` product row. | Opens moderation modal with all product fields disabled in read-only state with enhanced contrast design-system wide (title, slug, brand, category, description without focus ring on click, price, currency, status); vendor proposal banner resolves seller name (`Proposed by vendor: {sellerName}`) via direct `getSeller` endpoint; backend rejects field edits on pending products (`PRODUCT_IN_REVIEW` 422); approve requires `Permission.PRODUCT_APPROVE` and logs `catalog.product_approved`; reject prompts feedback modal and writes `spec.rejectionNote` / `spec.rejectedAt` with `catalog.product_rejected` audit event; all 4 sub-dialogs (Options, Variants, Media, Offers) enforce read-only view mode with "Pending Review" warning badge and blocked mutations. | `tmp/catalog/products/06-products-review-modal-vendor-3p.png` |
| **1.8** | Approve & Publish Workflow & Reactive Removal | Moderation action | Click "Approve & Publish" in review modal on pending review list. | Submits minimal status-only payload (`{ status: 'active', expectedUpdatedAt }`), omitting base product fields to satisfy backend `PRODUCT_IN_REVIEW` (422) guard; product status transitions to `active`; modal closes; product is reactively removed from the pending list view without a full page reload if active filter is pending. | `tmp/catalog/products/07-products-approved-active.png` |
| **1.9** | Soft-Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Archive" from product row dropdown menu. | Product is optimistically removed from list; single toast notification appears with actionable **"Undo"** button and 5s `TimerBar` progress countdown. | `tmp/catalog/products/08-products-soft-delete-undo.png` |
| **1.10** | Archived Tab & Status-Preserving Restore | `ProductList` (Archived view) | Switch to "Archived" status; click "View details" or "Restore" on archived product row. | "View details" opens read-only inspection modal with disabled inputs and no save button; "Restore" opens confirmation prompt with title `'Restore product?'` and message `'\"{name}\" will be moved back to the live list.'`, then restores product to its exact pre-archive status (preserved in `spec._previousStatus`); success notification displayed. | `tmp/catalog/products/09-products-archived-tab.png` |
| **1.11** | Responsive Breakpoints (<1200px Card View) | `ProductList` & Modals | Emulate viewports between 390px and 1200px. | Desktop table switches to responsive card list below `xl` (1200px); desktop table wraps in horizontal scroll container (`min-w-[900px]`); modal headers use `pr-10/12` clearance so close button never overlaps titles or action buttons. | `tmp/catalog/products/10-products-mobile-cards.png` |
| **1.12** | Secondary Filter Reset on Status Change | Status dropdown (`ProductList`) | With secondary filters set (search query, origin, category, brand), switch status in popover. | Secondary filters and search query automatically reset to default empty state, preventing false 0-result empty states in destination status. | `tmp/catalog/products/13-products-status-filter-reset.png` |
| **1.13** | Two-Line Title Layout, Cell Truncation & Single-Line Price | `ProductList` table cells | Inspect long product titles, categories, and brands on narrow viewports. | Product title formats cleanly across up to two lines (`line-clamp-2 leading-snug break-words max-w-[280px]`) with origin badge (`1P`/`3P`) pinned to the top-right and optical baseline alignment (`shrink-0 mt-0.5`), clamping with ellipsis on line 2; full title accessible via `title=` hover tooltip; categories and brands truncate cleanly with tooltips; base price is single-line fixed-width `tabular-nums font-mono whitespace-nowrap`; unbranded items display `—`. | `tmp/catalog/products/14-products-cell-truncation-and-price.png` |
| **1.14** | Clean Edit No-Op Save Bypass | `ProductFormModal` (Edit mode) | Open edit modal on an existing product without making changes (`!isDirty`) and click save. | Clean modal skips the redundant backend PUT request and closes immediately; modified/dirty forms proceed with standard mutation and optimistic concurrency check. | `tmp/catalog/products/05-products-edit-modal-locked-cat.png` |
| **1.15** | Archived Reference Name Resolution | `ProductOptionsDialog` & `ProductList` | Open product options or product list referencing archived option types, categories, or brands. | Resolves human-readable names (`optionTypeName.en`, `category.name.en`, `brand.name`) instead of raw UUID strings; displays fallback localized badges when archived. | `tmp/catalog/products/15-products-archived-reference-names.png` |
| **1.16** | Mobile Card Labeled Layout & Inline 1P/3P Badge | `ProductList` (<1200px) | Inspect responsive card rendering on small viewports with missing brands or prices. | Renders structured labeled rows: title with adjacent inline origin badge (1P/3P), slug, category, Brand ("Brand: X" or "Brand: —"), Base Price ("Base Price: X" or "Base Price: —"), and Status; eliminates ambiguous bullet chains ("•—•—"). | `tmp/catalog/products/10-products-mobile-cards.png` |
| **1.17** | TipTap ProseMirror Rich Description Editor (B3) | `ProductFormModal` (`RichTextEditor`) | Open Create or Edit product modal. Click toolbar buttons (Bold, Italic, Strike, Superscript, Subscript, Align Left/Center/Right/Justify, H2, H3, BulletList, NumberedList, Blockquote, Divider, Link, Clear Formatting, Undo, Redo); insert and manipulate tables via Table popover (Insert 3×3, Add row before/after, Add column before/after, Delete row, Delete column, Delete table); insert curated e-commerce emojis via Emoji popover; enter link in popover with or without selected text; insert reusable structured content template (Features & Specifications, Care & Maintenance, Why You'll Love It); toggle full-screen distraction-free mode (or press Escape); inspect bounded scroll container, live word & character counts in footer bar, and size indicator near 50KB limit; inspect unsaved draft recovery banner on page reloads with Restore and Discard actions; test Escape key while inside fullscreen distraction-free mode within parent modal with and without open popovers; verify draft isolation across products, create-mode cancellation cleanup, and auto-clear on save. | ProseMirror AST schema validates strictly at contract boundary (50KB cap, node/mark allowlist including table with `align: 'left' | 'center' | 'right'` cell attribute and superscript/subscript, protocol validation rejecting `javascript:`/`data:`); `isDocEmpty` recursively traverses AST nodes to detect nested tables and content at any nesting depth; toolbar is memoized (`EditorToolbar`) with local TipTap event listeners (`selectionUpdate`/`transaction`), eliminating parent component re-render churn during cursor movement while instantly updating active button styling; Text alignment sets nullable attributes (`textAlign: 'left' | 'center' | 'right' | 'justify'`); Table controls insert resizable ProseMirror table structures formatted cleanly in `docToPlainText` with full before/after row & column symmetry without popover badge crowding; Emoji picker inserts curated symbols (`⭐`, `🔥`, `✨`, `📦`, `🏷️`, etc.); Link popover validates URLs (`http(s)://`, `mailto:`, `tel:`, `/` with WHATWG control-character and protocol-relative escape rejection) with distinct "Edit link" title and requires display text when selection is empty while skipping text input when editing highlighted text; pre-made category-neutral templates dropdown (Features & Specifications, Care & Maintenance, Why You'll Love It) inserts localized next-intl structured AST nodes conforming to schema; full-screen button expands editor to an immersive overlay with capture-phase Escape listener that closes open toolbar popovers first before exiting fullscreen, using `e.stopImmediatePropagation()` so the parent form modal is never dismissed; footer bar continuously computes and displays live word count, character count, and UTF-8 JSON byte length (`X words • Y characters | Z KB / 50 KB`); draft recovery isolates drafts using scoped keys (`shopnetic:draft:product-desc:${id}` for edit, `shopnetic:draft:product-desc:create` for create), re-validates drafts with `productDescriptionDocSchema.safeParse` before restoration (discarding corrupt entries), normalizes keys recursively for deterministic doc comparison across PostgreSQL JSONB key reordering, automatically clears drafts upon successful save and upon closing/canceling create mode or route unmount with React StrictMode-resilient delayed cleanup (preventing cross-product draft leakage while surviving dev mount-cleanup-remount), and fully suppresses drafts and recovery banners in read-only / review mode (`disabled=true`); container enforces bounded height (`min-h-[140px] max-h-[260px] overflow-y-auto`) with a pinned toolbar preventing modal blowout; contenteditable container implements native ARIA role='textbox' and aria-disabled with dedicated label[for] click-to-focus delegation without redundant hidden inputs or Chrome aria-hidden interventions; read-only review/view modes disable toolbar, template selection, and input; JSON AST saves seamlessly to `description_i18n` with backward-compatible string-to-doc conversion. | `tmp/catalog/products/16-products-rich-description-editor.png` |
| **1.18** | ProductFormModal Field Validation & Server Error Mapping | `ProductFormModal` | Attempt submission with empty title, invalid slug regex / reserved slug (`admin`), or invalid price decimals (`19.999` in USD). Trigger server errors (`PRODUCT_SLUG_TAKEN` 409, `PRODUCT_BRAND_REQUIRED` 422, `PRODUCT_BRAND_NOT_ALLOWED` 422, `VALIDATION_ERROR` 422). | Client-side Zod schema blocks submission and renders inline field errors: `"Please enter a product title."` for empty title, `"Lowercase letters, digits, and single hyphens only."` for invalid/reserved slug, and `"Enter a valid non-negative number."` for invalid price decimals; API rejects are caught and mapped cleanly via `FIELD_FOR_CODE` to inline field errors (`"That product slug is already in use."` for slug, `"This category requires a brand. Please select a brand."` or `"This category does not allow a brand. Please select None."` for brand), while unmapped/generic backend validation errors display the top banner alert `"Please check the highlighted fields."` without unhandled exceptions or blank screens. | `tmp/catalog/products/17-products-form-validation-errors.png` |

---

#### Group 2: Product Options Configuration & Governance

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Missing Required Axes & Empty Axis Values Alert | `ProductOptionsDialog` | Open row menu on product and click "Configure Options". | `ProductOptionsDialog` opens; if mandatory category axes are unconfigured, renders top alert banner: *"This product is missing required category options: [AxisName]"*; if a required axis is configured but has 0 values selected, renders warning banner (`emptyRequiredSingle`/`emptyRequiredPlural`) and highlights table cell with *"No values selected (Required)"*; offered values table column displays localized labels with swatch hex circles for swatch option types; Single-value picker skip dropdown is localized. | `tmp/catalog/products/options-variants/01-product-options-dialog-missing-required.png` |
| **2.2** | Add Option Axis from Category | `ProductOptionsDialog` axis pool | Select required option (e.g. Size) from category pool dropdown; click "Add Option Axis". | Option added to table with "Variant Axis" and "Required by Category" badges; missing required banner dismisses. | `tmp/catalog/products/options-variants/02-option-size-added.png` |
| **2.3** | Select Offered Values Modal | `ValueSelectModal` | Click "Select Values" button on Size row. | `ValueSelectModal` opens showing catalog values (XS, S, M, L, XL); clicking "Select all" checks all values; clicking "Save Values" persists configuration. | `tmp/catalog/products/options-variants/03-size-values-selection-modal.png` |
| **2.4** | Optional & Swatch Option Setup | `ValueSelectModal` (Color axis) | Add Color option axis; open `ValueSelectModal`. | Displays color chips, hex swatches, and labels; select subset (Black, White, Navy); save values. | `tmp/catalog/products/options-variants/04-color-values-selection-modal.png` |
| **2.5** | Fully Configured Options Display | `ProductOptionsDialog` table | Inspect options table with multiple axes. | Displays badges, offered values pill list with count, and Single Value Skip picker set to *"Normal variation (show picker)"*. | `tmp/catalog/products/options-variants/05-product-options-configured.png` |
| **2.6** | Single-Value Picker Skip Toggle | Single-value skip selector | On an option with one choice (e.g. One Size), select single value in skip picker. | Saves `requiredValueId`; shows hint that storefront will bypass the picker. | `tmp/catalog/products/options-variants/05-product-options-configured.png` |
| **2.7** | Destructive Option Delete Confirmation & In-Use Guard | `OptionDeleteConfirmModal` & in-use conflict guard | Click delete icon on an option axis. | Opens `OptionDeleteConfirmModal` with destructive confirm button; on confirmation, deletes option axis; if active (non-deleted) variants are using it, UI intercepts backend `409 CONFLICT`, auto-closes the confirm modal, and displays localized destructive banner: *"Cannot remove this option because existing variants are currently using it."*; if all variants are soft-deleted or none exist, the option is deleted cleanly and any orphaned soft-deleted variants for that option are purged. | `tmp/catalog/products/options-variants/resiliency/r02-option-in-use-by-variants-conflict.png` |
| **2.8** | Navigation Transition | Transition to variants | Click **"Manage Variants →"** button in dialog footer. | Options dialog gracefully closes and `ProductVariantsDialog` automatically opens. | `tmp/catalog/products/options-variants/06-variants-dialog-empty.png` |
| **2.9** | Archived & Pending Product View-Only Mode | `ProductOptionsDialog` (Archived / Pending product) | Open "Configure Options" on an archived or pending review product. | Dialog renders "Archived" or "Pending Review" badge and appropriate subtitle (`dialogSubtitleArchived`/`dialogSubtitlePending`); reachable from row menu for both archived and pending products; backend loads options cleanly (`allowArchived=true`); Add Option toolbar, Delete action buttons, and Actions column header are hidden; Single Value Skip selector is disabled; backend mutations blocked with 409 conflict (`PRODUCT_PARENT_ARCHIVED`/`PRODUCT_IN_REVIEW`). | `tmp/catalog/products/options-variants/05-product-options-configured.png` |

---

#### Group 3: Product Variants Matrix & Cartesian Generation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Variants Empty State | `ProductVariantsDialog` | Open variants dialog before generation. | Displays clean empty state: *"No variants generated yet"* with action button **"Generate Variants"** and link **"← Configure Options"**. | `tmp/catalog/products/options-variants/06-variants-dialog-empty.png` |
| **3.2** | Cartesian Generator Modal & Empty Axes Guidance | `GeneratorModal` | Click **"Generate Variants"** button. | `GeneratorModal` computes Cartesian product (e.g. 5 sizes × 3 colors = 15 combos); displays combination preview chips, SKU prefix input, and combination count warning banner (if >100); if any variant axis has 0 values selected, renders explanatory warning banner (`The following variant axes have no values selected: {axes}`) with guidance (`Configure offered values in Options & Attributes before generating combinations.`) and disables combination generation rather than silently returning 0 combos. | `tmp/catalog/products/options-variants/07-cartesian-generator-modal-selected.png` |
| **3.3** | Bulk Variant Creation | Bulk generation mutation | Enter SKU prefix (e.g. `PROTEE-`), select all combinations, click "Generate". | Backend creates variants in bulk; table populates with variant rows displaying combination chips, SKU codes, active badges, and action buttons. | `tmp/catalog/products/options-variants/08-variants-matrix-generated-table.png` |
| **3.4** | Edit Variant Metadata Modal | `VariantFormModal` | Click "Edit" (`Edit2` icon) on a variant row. | `VariantFormModal` opens; combination badges are permanently locked; fill in GTIN barcode (8–14 digits), weight in grams, dimensions (L × W × H mm), and save. | `tmp/catalog/products/options-variants/09-variant-edit-modal-filled.png` |
| **3.5** | Real-Time Table Metadata Update | `VariantFormModal` save | Submit variant edit modal. | Variant row immediately updates showing new GTIN, formatted weight (e.g. `185g`), and formatted dimensions (`280 × 200 × 15 mm`). | `tmp/catalog/products/options-variants/10-variant-updated-in-table.png` |
| **3.6** | Variant Soft-Delete with Undo Toast & Optimistic Updates | `useSoftDeleteWithUndo` & variant row action | Click "Delete variant" icon button on a row; inspect modal header title and list behavior; click Undo. | Variant is optimistically removed from the list instantly without full list reload or skeleton flash; single toast notification appears with actionable **"Undo"** button and 5s `TimerBar` progress countdown; clicking Undo restores the variant immediately (optimistic restore + background verification) without closing the open Variants dialog (Radix dialog interaction with Sonner toast container guarded via `isToastInteraction`); modal header displays total variant count badge (`StatusBadge` tone neutral font-mono `{variants.length}`). | `tmp/catalog/products/options-variants/11-variant-deleted-row-removed.png` |
| **3.7** | Reciprocal Back-Transition | Back-navigation link | Click **"← Configure Options"** in footer. | Variants dialog closes and Product Options dialog seamlessly reopens with preserved options configuration. | `tmp/catalog/products/options-variants/12-navigated-back-to-options-dialog.png` |
| **3.8** | Duplicate Combination Collision Guard | Cartesian generator / variant creation | Attempt to generate combinations when some already exist, or submit a variant matching an existing combination signature. | Generator filters out existing signatures using pipe delimiter (`'|'`); backend rejects collisions with `VARIANT_COMBO_EXISTS` (409) based on deterministic sorted option-value tuple signature (`${optionTypeId}:${optionValueId}`). | `tmp/catalog/products/options-variants/resiliency/r02-option-in-use-by-variants-conflict.png` |
| **3.9** | Denormalized Combination Name Resolution & Mobile Row-Wise Footer | `ProductVariantsDialog` & `VariantFormModal` | Open variant edit modal or view variants list with archived option types or on mobile viewport (<768px). | Variant selections resolve option type names and value codes directly from backend-denormalized fields and fallback maps (never displaying raw UUID strings); dialog footer buttons arrange row-wise with wrap support rather than stacking into full-width vertical blocks. | `tmp/catalog/products/options-variants/10-variant-updated-in-table.png` |
| **3.10** | Inline Validation & Keystroke Hardening on Variant Form | `VariantFormModal` | Submit variant with malformed GTIN (<8 or >14 digits) or attempt typing/pasting letters/negative signs into weight or dimension inputs. | `react-hook-form` + Zod schema enforces 8-14 numeric digit barcode with localized inline error; `integerKeyDownHandler` and `integerPasteHandler` block non-digits; dimension inputs require positive whole numbers (>0) when provided (0 rejected with localized error); server contract `variantDimsSchema` enforces positive integers at boundary; form displays inline `Field error` and blocks API submission. | `tmp/catalog/products/options-variants/09-variant-edit-modal-filled.png` |
| **3.11** | Archived & Pending Product View-Only Mode | `ProductVariantsDialog` (Archived / Pending product) | Open "Manage Variants" on an archived or pending review product. | Dialog renders "Archived" or "Pending Review" badge and appropriate subtitle (`dialogSubtitleArchived`/`dialogSubtitlePending`); reachable from row menu for both archived and pending products; backend loads variants cleanly (`allowArchived=true`); "+ Add Variant" and "Generate Variants" buttons in header and empty state are hidden; variant row Edit and Delete action buttons are hidden; backend mutations blocked with 409 conflict (`PRODUCT_PARENT_ARCHIVED`/`PRODUCT_IN_REVIEW`). | `tmp/catalog/products/options-variants/10-variant-updated-in-table.png` |

---

#### Group 4: Product Media Gallery & Variant Tagging

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Media Gallery Initial Open | `ProductMediaDialog` | Open row menu on product; click "Manage Media". | `ProductMediaDialog` opens displaying empty state: *"No media uploaded yet"*, upload action, and filter tabs (All, General, Variant-Specific). | `tmp/catalog/products/media/01-media-gallery-initial-empty.png` |
| **4.2** | Add Image Asset Modal | `MediaFormModal` | Click **"Add Media"** button. | Modal opens with Kind selector ("Image" vs "Video"), file key input, and alt text input. | `tmp/catalog/products/media/02-add-media-modal-open.png` |
| **4.3** | Submit Image & Cover Badge | Media position 0 resolution | Fill file key (`tee-white-front.jpg`), alt text, and save. | Image card appears at position 0; automatically designated as primary with amber **"Product Cover"** badge. | `tmp/catalog/products/media/03-media-image-added.png` |
| **4.4** | Add Video Asset with Poster | Video card & player overlay | Click "Add Media", select "Video" kind, fill video file key, mandatory `posterKey`, duration (24s). | Video card renders with center play button overlay and duration indicator pill (`24s`). | `tmp/catalog/products/media/04-media-video-added.png` |
| **4.5** | Option Axis Tagging | Media variant option selector | On image card, select option value tag (e.g. `Color: Navy`). | Card dynamically receives sky-blue **"Variant Lead"** badge, designating it as the leading photo when that variant is selected on the PDP. | `tmp/catalog/products/media/05-media-tagged-to-option.png` |
| **4.6** | Filter Tabs (General vs Variant) | Gallery filter tabs | Click "General (1)" tab; click "Variant-Specific (1)" tab. | "General" shows only untagged video; "Variant-Specific" shows only color-tagged image; count pills reflect accurate tallies. | `tmp/catalog/products/media/06-filter-tab-general.png` & `07-filter-tab-variant.png` |
| **4.7** | Transactional Reorder | Asset reorder buttons | Reorder assets using move forward/backward buttons. | Asset positions swap atomically; "Product Cover" badge re-evaluates to the new position 0 untagged asset. | `tmp/catalog/products/media/08-reordered-cover-changed.png` |
| **4.8** | Permanent Hard Delete Confirmation | Deletion confirm modal | Click delete button on media card. | Destructive confirmation modal opens displaying permanent deletion warning and storage key; confirming permanently removes asset. | `tmp/catalog/products/media/11-delete-confirm-dialog.png` & `12-media-deleted-success.png` |
| **4.9** | Cross-Dialog Navigation | Multi-modal transitions | Click footer buttons **"← Manage Variants"** and **"← Configure Options"**. | Seamlessly transitions back and forth between Options, Variants, and Media dialogs. | `tmp/catalog/products/media/09-transition-to-variants.png` & `10-transition-back-to-media.png` |
| **4.10** | Inline Validation on Media Form Modal | `MediaFormModal` | Submit without file key or select Video kind without poster thumbnail; attempt typing letters into duration input. | Enforces required `fileKey`, required `posterKey` for video assets, and 1–86,400s duration bounds via `mediaFormSchema` with localized inline field errors; blocks invalid keystrokes and paste. | `tmp/catalog/products/media/02-add-media-modal-open.png` |
| **4.11** | Archived & Pending Product View-Only Mode | `ProductMediaDialog` (Archived / Pending product) | Open "Manage Media" on an archived or pending review product. | Dialog renders "Archived" or "Pending Review" status badge and appropriate subtitle (`dialogSubtitleArchived`/`dialogSubtitlePending`); Add Media action button is hidden; media card delete and variant tag controls are disabled or hidden; backend mutations blocked with 409 conflict (`PRODUCT_PARENT_ARCHIVED`/`PRODUCT_IN_REVIEW`). | `tmp/catalog/products/media/01-media-gallery-initial-empty.png` |
| **4.12** | Option Tag Select Boundary Containment & Cell Alignment (B11) | Media card option-tag dropdown | Inspect option tagging dropdown on media cards in right-most columns and on compact screens. | Option tag trigger shrinks with `min-w-0 flex-1` inside media card cell; open dropdown panel aligns to end (`align="end"`) and constrains to modal bounds (`collisionBoundary`) preventing overflow past modal borders over backdrop. | `tmp/catalog/products/media/05-media-tagged-to-option.png` |
| **4.13** | Video Preview Playback Modal (B10) | Video media card play trigger | Click play button or thumbnail on a video media asset card. | Opens centered `VideoPreviewModal` mounting native HTML5 `<video src={asset.fileKey} poster={asset.posterKey} controls autoPlay muted />` (muted attribute prevents silent browser autoplay blocking policy); displays asset title / fileKey; provides an explicit Fullscreen toggle button invoking the Fullscreen API; provides an 'Edit details' button directly transitioning to the `MediaFormModal` without losing context; includes playback speed selector buttons (`0.5x`, `1x`, `1.25x`, `1.5x`, `2x`) synchronized bi-directionally with native controls via `onRateChange` and resetting both UI state and DOM `<video>.playbackRate` to 1x on video switch and modal reopen; provides direct 'Open original' link in a new tab (`target="_blank" rel="noopener noreferrer"`); features previous / next navigation controls (`ChevronLeft`/`ChevronRight`), asset counter badge (`N / Total`), and keyboard arrow (`ArrowLeft`/`ArrowRight`) shortcuts to browse all video assets in the gallery without closing modal; includes `onError` fallback on gallery poster thumbnails to prevent broken image displays; gracefully displays localized error state if video source fails to load; closing via Close button, backdrop, or Escape completely unmounts the `<video>` element, immediately terminating audio/playback. | `tmp/catalog/products/media/14-video-preview-modal.png` |

---

#### Group 5: Offers, Multi-Warehouse Stock & Buy-Box Management

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **5.1** | Offers Dialog Overview | `ProductOffersDialog` | Open row menu on product; click "Offers & Stock". | `ProductOffersDialog` opens showing product title, variant tabs with offer counts, Buy-Box winner summary card, and offers table. | `tmp/catalog/products/offers/01-offers-dialog-overview.png` |
| **5.2** | Multi-Offer Variant Competition | Variant tabs & Buy-Box card | Click variant tab with competing offers (e.g. `TEE-BLK-M`). | Dynamic Buy-Box Winner diagnostic card recalculates immediately, displaying winner badge, winning seller (`Shopnetic Retail Inc.`), winning price (`$17.99`), competing seller count (2 sellers), and pricing range (`$17.99 – $19.99`). Table marks Winner vs Competing listings. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.3** | Empty Buy-Box State | Diagnostic card (empty) | Click variant tab with zero offers. | Card gracefully displays empty diagnostic state: *"No Buy-Box Winner — No active in-stock offers are currently competing for this variant."* | `tmp/catalog/products/offers/01-offers-dialog-overview.png` |
| **5.4** | Create Seller Offer Modal | `OfferFormModal` | Click **"Add Offer"** button in dialog header. | `OfferFormModal` opens with seller picker, variant picker, listing price input, promotional sale dates, handling days, order limits, and initial warehouse allocation. | `tmp/catalog/products/offers/03-create-offer-modal.png` |
| **5.5** | Offer Form Minor Unit Calculation | Price formatting & cents math | Fill price (`$18.50`), sale price (`$16.00`), promotional dates, handling days (2), initial stock (25). | Form inputs format cents to dollars in real time; validation prevents negative prices or invalid ranges. | `tmp/catalog/products/offers/03b-create-offer-modal-filled.png` |
| **5.6** | Multi-Warehouse Stock Modal & Archived / Pending Guard | `StockAdjustModal` & `ProductOffersDialog` | Click "Adjust Stock" on an offer row; verify behavior on archived or pending review products. | Opens multi-warehouse allocation modal with on-hand, reserved, safety stock, backorder switch, and restock ETA; warehouse list is strictly filtered to the offer's seller (`warehouses.filter(w => w.sellerId === offer.sellerId)`); input grid uses `items-start` for horizontal alignment; saving stock updates `stockAdjustState.offer` and triggers background offer refresh without wiping uncommitted row states; on archived or pending products, "Adjust Stock" button is hidden/disabled alongside sibling mutation actions; backend stock and offer services reject mutations on archived/pending parent products with 409 CONFLICT (`PRODUCT_PARENT_ARCHIVED`/`PRODUCT_IN_REVIEW`). | `tmp/catalog/products/offers/04-stock-adjust-modal.png` |
| **5.7** | Register New Warehouse with Seller Selection | `WarehouseFormModal` | Click **"New Warehouse"** in dialog header without preselected seller, or from inside Stock Adjust modal with preselected seller. | When launched without seller context, renders Seller `<Select>` dropdown with validation (`err.sellerRequired`) and generic subtitle; when launched from stock adjustment, locks to offer seller and renders seller-specific subtitle; address grid adapts responsively (`grid-cols-1 sm:grid-cols-2`). | `tmp/catalog/products/offers/05-new-warehouse-modal.png` |
| **5.8** | Soft Delete Offer with Undo Toast & Tab Preservation | `useSoftDeleteWithUndo` (Offers) | Click "Delete Offer" (`Trash2` icon) on a competing listing; switch variant tabs or wait 20s and click Undo. | Offer row is immediately hidden, Buy-Box recalculates; localized undo toast with a `TimerBar` progress countdown appears; resync preserves active variant tab (via `selectedVariantIdRef.current` and `loadData({ preserveSelected: true })`) without resetting view back to tab 0 or snapping back on deep-link; delayed Undo callback refreshes Buy-Box for the live active variant. | `tmp/catalog/products/offers/06-offer-soft-delete-undo-toast.png` |
| **5.9** | Restore Offer via Undo | Undo toast action | Click "Undo" on the soft-delete notification toast. | Offer is seamlessly restored to the live table, status badge re-evaluates, and success confirmation is displayed. | `tmp/catalog/products/offers/07-offer-restored-success.png` |
| **5.10** | Deep-Link Direct Mount | Deep-link routing (`useHighlightTarget`) | Navigate to `?target=<productId>&action=offers`. | Deep-link routing automatically opens the Offers modal for the targeted product on initial page mount without user clicks. | `tmp/catalog/products/offers/08-deep-link-offers-open.png` |
| **5.11** | Mobile Responsive Viewport | Responsive modal layout | Emulate mobile viewport (390×844). | Horizontally scrollable variant tabs, responsive header buttons, and stacked metadata adapt cleanly to mobile screens. | `tmp/catalog/products/offers/09-offers-mobile-responsive.png` |
| **5.12** | Promotional Sale Window Expiration | Buy-Box price evaluator | Inspect Buy-Box for an offer where current time is outside active promotional window (`saleStartsAt <= now <= saleEndsAt`). | Algorithm validates promotional dates and falls back to regular listing price (`priceMinor`) outside window; promotional sale badge and strikethrough are omitted. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.13** | Zero-Stock Backorder-Tolerant Winner & Stock Cell Badge | Backorder Buy-Box selection & offers table | Competing offer has 0 available on-hand stock but allows backorders (`Stock.backorder = true`) at lowest price. | Algorithm qualifies the listing under `totalAvailable > 0 || backorder` (evaluating `o.stocks.some(s => s.backorder)`); offer wins the Buy-Box; offers table stock cell displays neutral "Backorder Available" badge when any warehouse allows backorders. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.14** | Offer & Warehouse Stock Optimistic Concurrency Control (OCC) | `OfferFormModal` / `StockAdjustModal` | Submit an offer or warehouse stock level update concurrently with another admin modification. | Both `OfferFormModal` and `StockAdjustModal` supply the `expectedUpdatedAt` ISO timestamp; API intercepts stale edits and triggers `409 CONFLICT` optimistic concurrency error without silent overwrites. | `tmp/catalog/products/offers/03-create-offer-modal.png` & `04-stock-adjust-modal.png` |
| **5.15** | Responsive Stock Modal Header Layout | `StockAdjustModal` | Open stock adjustment modal on mobile viewport (<768px). | Modal header stacks title, description, and head metadata (SKU • condition • Total Available) first, with the "+ Add warehouse" action button positioned below metadata across full width, preventing overlap or squeezed titles. | `tmp/catalog/products/offers/04-stock-adjust-modal.png` |
| **5.16** | Warehouse Auto-Selection & Fallback Placeholder | `OfferFormModal` | Open offer creation modal for seller with warehouses vs without warehouses. | If seller has one warehouse, auto-selects it; if multiple, prompts selection; if zero warehouses, select trigger is disabled showing placeholder *"No warehouses found"* with helper text. | `tmp/catalog/products/offers/ui-offer-warehouse-autoselected.png` & `ui-offer-warehouse-dropdown.png` |
| **5.17** | Structured Currency Select & Comprehensive Form Validation | `OfferFormModal` | Select currency via `SUPPORTED_CURRENCIES` select; enter sale price >= list price, sale end before sale start, min qty < 1, or max qty < min qty. | Currency selection restricted to ISO currency list; `superRefine` enforces sale price strictly lower than list price, correct promotional window sequence, and quantity bounds; displays localized inline field errors and blocks submission. | `tmp/catalog/products/offers/03-create-offer-modal.png` |
| **5.18** | Numeric Keystroke Hardening on Multi-Warehouse Stock Adjust | `StockAdjustModal` | Type alphabet characters, decimal points, or negative signs into on-hand or safety stock inputs; paste invalid text; attempt submitting empty string. | `integerKeyDownHandler` and `integerPasteHandler` intercept invalid input; validation displays inline field error if left blank or malformed and prevents submission. | `tmp/catalog/products/offers/04-stock-adjust-modal.png` |
| **5.19** | Inline Validation & Address Sanitation on Warehouse Registration | `WarehouseFormModal` | Attempt submitting warehouse without seller (when not preselected), name, line1, city, postal code, or with invalid 2-letter country code. | `react-hook-form` + `warehouseFormSchema` renders localized inline field errors across seller picker and address inputs (`sellerRequired`, `nameRequired`, etc.); converts country code to uppercase; responsive grid adapts on mobile viewports. | `tmp/catalog/products/offers/05-new-warehouse-modal.png` |

---

#### Group 6: Network, Loading & Resiliency Tests (CDP & Synthetic Faults)

*(Executed via Chrome DevTools Protocol network interception or `.env` dev flags, restoring flags back to zero/empty upon completion)*

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **6.1** | Initial Mount Loading Skeletons | Inject 1500ms delay (`DEV_RESPONSE_DELAY_MS=1500` or `x-debug-delay: 1500`). | `ScrollLoadSkeleton` pulses smoothly during the delay window; zero layout jump or content popping. | `tmp/catalog/products/offers/resiliency/res-01-offers-loading-skeletons.png` |
| **6.2** | Tab Switch Skeleton Reset | Inject 1000ms delay and switch tabs (e.g. Active -> Draft). | Stale rows instantly unmount and transition into skeleton pulse; prevents frozen or ghost rows. | `tmp/catalog/products/resiliency/r01-tab-switch-transition.png` |
| **6.3** | Search Debouncing Latency | Rapid keyboard typing into search input. | Queries are debounced by 250ms; cancels in-flight fetches without out-of-order race conditions. | `tmp/catalog/products/resiliency/r02-debounced-search-result.png` |
| **6.4** | Double-Click & Double-Submit Guard | Inject 1500ms delay on mutation endpoints (`POST /offers`, `POST /variants`). | Save button enters disabled state with inline `Spinner` and `aria-busy="true"`; prevents duplicate submissions. | `tmp/catalog/products/offers/resiliency/res-02-offers-submit-spinner-disabled.png` |
| **6.5** | Synthetic Server 500 Fault | Inject 500 status (`DEV_FAULT_STATUS=500` or `x-debug-fault: 500`). | UI catches RFC-9457 error envelope gracefully; avoids white-screen crashes; displays localized error card with a prominent "Retry" button. | `tmp/catalog/products/offers/resiliency/res-03-offers-synthetic-500-fault.png` |
| **6.6** | Error Recovery on Retry | Clear synthetic 500 fault and click "Retry". | Table and dialogs recover cleanly and reload product data without requiring a full browser page refresh. | `tmp/catalog/products/resiliency/r04-recovered-after-retry.png` |
| **6.7** | Offline Network Disconnection | Emulate Chrome DevTools offline throttling (`Network.emulateNetworkConditions({ offline: true })`). | UI catches network disconnection as `errors.offline`; displays localized connection guidance notification rather than generic 500 server error copy. | `tmp/catalog/products/offers/resiliency/res-04-offers-offline-network-error.png` |
| **6.8** | Connectivity Restoration | Restore network connectivity to online. | Clicking retry immediately restores healthy communication with the API. | `tmp/catalog/products/media/resiliency/res-05-restored-healthy.png` |
| **6.9** | Review Mode Field & Sub-Dialog Mutation Rejection | Intercept or inject direct mutation payload (`PATCH /products/:id`, `POST /variants`, `POST /offers`, `POST /media`, `PUT /stock`) on a `pending` review product. | Backend rejects with `PRODUCT_IN_REVIEW` (409/422); UI intercepts error envelope and displays localized notification without desyncing form or dialog state. | `tmp/catalog/products/06-products-review-modal-vendor-3p.png` |
| **6.10** | Archived Parent Product Mutation Rejection | Attempt direct sub-resource mutation (`POST /variants`, `POST /offers`, `POST /media`, `PUT /stock`) against an archived parent product. | Backend blocks mutations with `PRODUCT_PARENT_ARCHIVED` (409); UI catches conflict envelope and maintains read-only integrity. | `tmp/catalog/products/09-products-archived-tab.png` |
| **6.11** | Vendor Attribution Banner Network / 404 Fallback | Mock `GET /admin/v1/sellers/:id` network error or unmapped 404 seller ID in review modal. | Banner gracefully falls back to displaying raw seller ID without throwing unhandled exceptions or breaking dialog mount. | `tmp/catalog/products/06-products-review-modal-vendor-3p.png` |
| **6.12** | Reactive Async Mount & Sibling Modal Transition Boundary Resolution | Multi-dialog transitions & deferred SelectContent mounting (Options, Variants, Media) | Mount dialogs with asynchronously loaded options/media data; transition back and forth across sibling modals via footer links ("← Manage Variants", "← Configure Options"). | Asynchronously rendered SelectContent components reactively bind to the enclosing ModalContent element via ModalBoundaryContext without stale null references; navigating across sibling dialogs cleanly detaches prior boundary and binds the new active modal container with zero cross-dialog boundary leakage or coordinate clipping. | `tmp/catalog/products/media/09-transition-to-variants.png` & `10-transition-back-to-media.png` |
| **6.13** | Offline URL Parameter Sync Resilience | Client-side filter or search update while offline (`window.history.replaceState`). | Interacting with search, tabs, or popover filters while offline updates the browser address bar cleanly without triggering Next.js background RSC network round-trips; completely prevents browser-level `ERR_INTERNET_DISCONNECTED` hard navigation crashes. | `tmp/catalog/products/13-products-status-filter-reset.png` |

---

## 11. UI Tests Specification (Brands Management)

### Comprehensive Brands UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` against `apps/api` catalog brand services (`BrandService`, `brand_alias`, brand merge saga).

```
Group 1: Brand Directory, Search & Deep-Linking
Group 2: Brand Creation, Editing & Concurrency Invariants
Group 3: Brand Merge & Alias Consolidation Tool
Group 4: Soft-Delete, Undo, Restore & Product Guards
Group 5: Network, Loading & Resiliency Tests
```

---

#### Group 1: Brand Directory, Search & Deep-Linking

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Desktop Brand Directory | `BrandList` (`/catalog/brands`) | Navigate to `/catalog/brands` at 1440×900 viewport. | Displays header, search bar (`/` shortcut), Active/Archived/All tabs, and table with Name, Slug, Aliases count, Restricted status, and 3-dots action menu. | `tmp/catalog/brands/01-brands-desktop-list.png` |
| **1.2** | Multi-Word Debounced Search | Brand search bar | Type query (e.g. "FX Live Brand 50"). | Debounces 250ms, queries API, filters table results to matching brand rows. | `tmp/catalog/brands/02-brands-search-results.png` |
| **1.3** | Deep-Link Targeting | `useHighlightTarget` | Navigate to `/catalog/brands?highlight=<brandId>`. | Issues high-priority fetch, pins target brand to very top of table with spotlight highlight tint (`bg-primary/5`), and avoids duplicate row display. | `tmp/catalog/brands/03-brands-deep-link-target.png` |
| **1.4** | Mobile Responsive Layout | Mobile breakpoint | Emulate mobile viewport (390×844). | Table converts to stacked card layout with badges, aliases, and accessible action menu. | `tmp/catalog/brands/11-brands-mobile-cards.png` |
| **1.5** | Radix Select Status Filter with Base Brand Color Highlight | `BrandList` status filter | Click status filter Radix Select dropdown ("All statuses"). | Floating menu mounts at elevated z-index; selected option highlights in base brand color with white text, and hover state uses a subtle lighter tint without check icons. | `tmp/catalog/brands/ui-brand-status-filter-select.png` |
| **1.6** | Status Filter Reset on Archived Tab Switch | `BrandList` status tabs & dropdown | Filter by a status (e.g. "Pending") on the Live tab, then switch to "Archived" (either via tab click or deep-link targeting), then return to "Live". | Both manual tab switching and deep-link targeting route through `handleTabChange`, which hides the secondary status dropdown, removes `status` from the URL query string, and resets `statusFilter` to `all`; returning to Live shows all live brands without silently remembering or leaking the leftover filter. | `tmp/catalog/brands/01-brands-desktop-list.png` |

---

#### Group 2: Brand Creation, Editing & Concurrency Invariants

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Create Brand Modal | `BrandFormModal` (Create) | Click **"+ New brand"** button. | Opens modal with autofocus on Name, auto-slug preview, English Display Name, Status, Restricted switch, Logo key, and Alias input chip field. | `tmp/catalog/brands/04-brands-create-modal-open.png` |
| **2.2** | Add Brand Aliases | Alias chip manager | Enter alias names (e.g. "Nova Audio") and click Add / press Enter. | Aliases added as removable chips; validates uniqueness before saving. | `tmp/catalog/brands/05-brands-create-aliases-chips.png` |
| **2.3** | Edit Brand Modal | `BrandFormModal` (Edit) | Click "Edit" in row action menu. | Prepopulates existing brand attributes and aliases; saves with `expectedUpdatedAt` concurrency guard. | `tmp/catalog/brands/06-brands-edit-modal-restricted.png` |
| **2.4** | Restricted Brand Toggle | Restricted switch | Toggle "Restricted (counterfeit-prone)" switch in edit modal. | Updates immediately; restricted badge displays; signals catalog moderation requirement (Q31). | `tmp/catalog/brands/06-brands-edit-modal-restricted.png` |
| **2.5** | Pristine Close Guard | Modal dismiss | Open edit modal and close without modifications. | Modal closes instantly without dirty-state confirmation prompt. | `tmp/catalog/brands/04-brands-create-modal-open.png` |

---

#### Group 3: Brand Merge & Alias Consolidation Tool

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Brand Merge Modal Open | `BrandMergeDialog` | Select "Merge" from action dropdown menu on source brand. | Opens merge modal showing source brand name, target brand search picker, and permanent consolidation warning banner. | `tmp/catalog/brands/07-brands-merge-modal-open.png` |
| **3.2** | Select Target Brand & Preview | Target brand selector | Choose destination brand from searchable list. | Destination brand is selected and highlighted in the candidate picker list; enables Merge action button. | `tmp/catalog/brands/08-brands-merge-target-selected.png` |
| **3.3** | Execute Merge Transaction | Merge submit action | Confirm merge action. | API runs single atomic transaction: aliases repointed to target, source brand marked `mergedIntoBrandId` and soft-deleted, products consolidated, success toast fired. | `tmp/catalog/brands/ui-brand-merge-dialog-title.png` |

---

#### Group 4: Soft-Delete, Undo, Restore & Product Guards

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Soft Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Delete" on an unused brand. | Row disappears optimistically; single toast notification appears with actionable **"Undo"** and 5s `TimerBar` countdown. | `tmp/catalog/brands/09-brands-soft-delete-undo.png` |
| **4.2** | Brand Archival Guard on Live Products | Delete action guard | Attempt to archive brand currently referenced by live products. | Intercepts `BRAND_HAS_PRODUCTS` (409) conflict; displays localized warning toast: *"Cannot archive this brand because it is used by active or draft products."* | `tmp/catalog/brands/09-brands-soft-delete-undo.png` |
| **4.3** | Archived Tab & Restore Confirmation | Archived view | Switch to "Archived" tab; click "Restore" on archived brand row. | Modal confirms un-archival; brand restores to active list upon confirmation. | `tmp/catalog/brands/10-brands-archived-tab.png` |
| **4.4** | Merged Brand Restore Blocked | Restore guard | Attempt to restore a brand that was previously merged. | Intercepts `BRAND_MERGE_INVALID` (422) error: *"Cannot restore a brand that was merged into another brand."* | `tmp/catalog/brands/10-brands-archived-tab.png` |

---

#### Group 5: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **5.1** | Initial Mount Skeletons | Inject 1500ms delay (`DEV_RESPONSE_DELAY_MS=1500`). | Table grid renders pulsing skeleton rows matching columns without layout jump. | `tmp/catalog/brands/res-01-brands-loading-skeletons.png` |
| **5.2** | Double-Click Save Guard | Inject 1500ms network latency. | Save button disables immediately with inline `Spinner`, preventing duplicate requests. | `tmp/catalog/brands/res-02-brands-submit-spinner-disabled.png` |
| **5.3** | Synthetic Server 500 Fault | Inject 500 status on `/admin/v1/brands`. | UI catches error envelope, displays localized error banner, and exposes working "Retry" button. | `tmp/catalog/brands/res-03-brands-synthetic-500-fault.png` |
| **5.4** | Offline Disconnection Guidance | DevTools offline mode. | Triggers `errors.offline` connection guidance instead of generic 500 server error copy. | `tmp/catalog/brands/res-04-brands-offline-guidance.png` |

---

## 12. UI Tests Specification (Option Types & Global Values)

### Comprehensive Option Types UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` against global option type & value endpoints (`apps/api/src/catalog/option-type.service.ts`).

```
Group 1: Option Types Directory & Deep-Linking
Group 2: Option Type Creation, Data Types & Swatches
Group 3: Option Values Management & Value Deprecation
Group 4: Soft-Delete, Undo & In-Use Guards
Group 5: Network, Loading & Resiliency Tests
```

---

#### Group 1: Option Types Directory & Deep-Linking

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Option Types Directory Overview | `OptionTypeList` (`/catalog/option-types`) | Navigate to `/catalog/option-types` on desktop. | Displays table with Code, Name, Data Type badge (`select`, `swatch`, `text`, `number`, `bool`), Swatch flag, Values count pill, and actions menu. | `tmp/catalog/option-types/01-option-types-desktop-list.png` |
| **1.2** | Deep-Link Targeting | `useHighlightTarget` | Navigate to `?highlight=<optionTypeId>`. | Pinned to top of table with spotlight highlight tint; avoids duplication when full page finishes loading. | `tmp/catalog/option-types/02-option-types-deep-link-target.png` |
| **1.3** | Mobile Responsive Card Layout | Mobile breakpoint | Emulate mobile screen (390×844). | Transforms to responsive card layout with values count and accessible actions. | `tmp/catalog/option-types/09-option-types-mobile-cards.png` |
| **1.4** | Radix Select Status Filter with Base Color Styling | `OptionTypeList` status filter | Open status filter dropdown on option types page. | Renders styled Radix Select with base brand background and white text on selected status and lighter tint on hover. | `tmp/catalog/option-types/ui-option-types-status-filter.png` |

---

#### Group 2: Option Type Creation, Data Types & Swatches

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Create Option Type Modal | `OptionTypeFormModal` (Create) | Click **"+ New option type"** button. | Opens modal with Code, Name, Data Type selector (`select`, `swatch`, `text`, `number`, `bool`), and Has Swatch toggle. | `tmp/catalog/option-types/03-option-types-create-modal-open.png` |
| **2.2** | Swatch Configuration | Swatch data type | Select `swatch` data type and enable "Has swatch" switch. | Displays color swatch preview helper explaining that values will support color swatches with hex codes. | `tmp/catalog/option-types/04-option-types-swatch-config.png` |
| **2.3** | Edit Option Type Modal | `OptionTypeFormModal` (Edit) | Click "Edit" in row menu. | Prepopulates fields; Data Type is rendered immutable (locked) to protect existing variants; checks `expectedUpdatedAt`. | `tmp/catalog/option-types/05-option-types-edit-modal-locked.png` |
| **2.4** | Elevated Radix Select Data Type Picker | `OptionTypeFormModal` (Data type select) | Open "+ New option type" modal and trigger Data Type select. | SelectContent renders at elevated `z-[60]` over dialog backdrop (`z-50`) without z-index clipping; selected item highlights in base background with white text. | `tmp/catalog/option-types/ui-option-type-form-datatype-select.png` |

---

#### Group 3: Option Values Management & Value Deprecation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Option Values Section in Form | Values management | In Edit modal, scroll down to Values section. | Shows existing values list with Name, Code, Status badge, Swatch color preview, and action controls. | `tmp/catalog/option-types/06-option-types-manage-values-open.png` |
| **3.2** | Add Option Value with Swatch | Add value form | Enter value code (e.g. `crimson-red`), label (`Crimson Red`), and swatch hex. | Value input fields ready with colored swatch preview chip; adds value to catalog. | `tmp/catalog/option-types/07-option-types-add-value-swatch.png` |
| **3.3** | Deprecate Option Value | Value status toggle | Toggle status of a value to `deprecated`. | Value is marked deprecated; hidden from new variant creation forms while preserving historical variants and orders. | `tmp/catalog/option-types/06-option-types-manage-values-open.png` |

---

#### Group 4: Soft-Delete, Undo & In-Use Guards

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Soft Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Delete" on an unused option type. | Optimistically hidden; toast displays with **"Undo"** and 5s countdown `TimerBar`. | `tmp/catalog/option-types/08-option-types-soft-delete-undo.png` |
| **4.2** | In-Use Deletion Guard | Delete action guard | Attempt to delete option type assigned to active category options or products. | Backend returns `409 CONFLICT`; UI displays localized alert preventing deletion. | `tmp/catalog/option-types/ui-option-types-table-truncation.png` |

---

#### Group 5: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **5.1** | Initial Loading Skeletons | Inject 1500ms latency. | Table displays skeleton placeholders without layout shifts. | `tmp/catalog/option-types/res-01-option-types-loading-skeletons.png` |
| **5.2** | Double-Submit Guard | Inject 1500ms delay on POST. | Button displays active spinner and disables clicks during mutation. | `tmp/catalog/option-types/res-02-option-types-submit-spinner-disabled.png` |
| **5.3** | Synthetic 500 Fault Handling | Inject 500 on option types fetch. | Error boundary displays localized message and retry action. | `tmp/catalog/option-types/res-03-option-types-synthetic-500-fault.png` |
| **5.4** | Offline Disconnection | Offline DevTools throttling. | Shows localized connection guidance copy. | `tmp/catalog/option-types/res-04-option-types-offline-guidance.png` |

---

## 13. UI Tests Specification (Value Sets Management)

### Comprehensive Value Sets UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` against `apps/api/src/catalog/value-set.service.ts` with connection-queue sequencing optimizations.

```
Group 1: Value Sets Directory, Search & Deep-Link Spotlight
Group 2: Value Set Creation, Staging & Reordering
Group 3: Soft-Delete, Undo & Lifecycle Restore
Group 4: Network, Connection Cap & Resiliency Tests
```

---

#### Group 1: Value Sets Directory, Search & Deep-Link Spotlight

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Value Sets Directory Overview | `ValueSetList` (`/catalog/value-sets`) | Navigate to `/catalog/value-sets` on desktop. | Displays header, search bar, Option Type dropdown filter, Live/Archived/All tabs, and table with Name, Scoped Option Type, Staged Values list, and actions menu. | `tmp/catalog/value-sets/01-value-sets-desktop-list.png` |
| **1.2** | Multi-Word Tokenized Search | Value set search | Type multi-token search (e.g. "Apparel Sizes"). | 250ms debounced search filters table by token match count without UI stutter. | `tmp/catalog/value-sets/10-multi-word-search-results.png` |
| **1.3** | Filter Dropdown Capped Height | Option type filter dropdown | Click option type dropdown filter. | Dropdown list is scrollable and capped (`max-h-60`) to prevent viewport overflow. | `tmp/catalog/value-sets/11-filter-dropdown-capped.png` |
| **1.4** | Deep-Link Spotlight Immediate Paint | `useHighlightTarget` | Navigate to `?highlight=<valueSetId>`. | Target item is spotlighted at top of list with amber tint on first paint with zero connection queue lag (`requestStart - startTime ≈ 1ms`). | `tmp/catalog/value-sets/09-deep-link-spotlight-immediate.png` |
| **1.5** | Mobile Responsive Card View | Mobile breakpoint | Emulate mobile viewport (390×844). | Table converts to responsive card view with pill chips and accessible action menu. | `tmp/catalog/value-sets/08-value-sets-mobile-cards.png` |
| **1.6** | Standardized Radix Select Option Type Filter | `ValueSetList` filter | Open Option Type filter on value sets list. | Dropdown displays capped scrollable list of option types with Radix Select semantics, base background with white text on selected option, and no dummy disabled items. | `tmp/catalog/value-sets/ui-value-sets-filter-select.png` |

---

#### Group 2: Value Set Creation, Staging & Reordering

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Create Value Set Modal | `ValueSetFormModal` (Create) | Click **"+ Add Value Set"** button. | Opens modal with Name, Option Type selector, and empty staged items container with warning banner: *"Please select an option type to add values."* | `tmp/catalog/value-sets/02-value-sets-create-modal.png` |
| **2.2** | Stage Values from Option Type | Option type select | Select an option type (e.g. "Size"). | Available option values appear as selectable checkboxes; warning banner dismisses. | `tmp/catalog/value-sets/03-value-sets-create-staging-values.png` |
| **2.3** | Clear Staging on Option Type Switch | Switch option type in create mode | Change selected option type from Size to Color. | Previously staged values are automatically cleared; loads new option type's available values. | `tmp/catalog/value-sets/03-value-sets-create-staging-values.png` |
| **2.4** | Save Value Set & Pinning | Save creation modal | Fill name ("Men's Shirt Sizes"), select XS–XXL, click Save. | Modal closes, success toast fires, new value set appears pinned at top of list with amber highlight. | `tmp/catalog/value-sets/04-value-sets-created-row.png` |
| **2.5** | Edit Value Set & Immutable Type | `ValueSetFormModal` (Edit) | Click "Edit" in row menu. | Opens modal; Option Type is rendered as an immutable locked badge; name and staged items remain editable. | `tmp/catalog/value-sets/05-value-sets-edit-modal-reorder.png` |
| **2.6** | Atomic Staged Items Reordering | Move Up / Move Down buttons | Click Move Up/Down on a staged value item. | Values swap positions atomically; display order persists on save. | `tmp/catalog/value-sets/05-value-sets-edit-modal-reorder.png` |
| **2.7** | Capped Modal Values Container | Modal scroll container | Open value set with >20 values. | Staged values container scrolls cleanly with capped max height (`max-h-60`). | `tmp/catalog/value-sets/12-modal-values-capped.png` |
| **2.8** | Elevated Radix Select & Values Picker State | `ValueSetFormModal` | Open value set form and click Option Type select or pick available values. | Option Type Radix Select mounts cleanly over modal at `z-[60]`; values picker displays informative placeholder when all values are staged. | `tmp/catalog/value-sets/ui-value-set-form-optiontype-select.png` & `ui-value-set-form-values-picker.png` |

---

#### Group 3: Soft-Delete, Undo & Lifecycle Restore

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Soft Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Archive" in row menu. | Row optimistically disappears; single toast appears with **"Undo"** and 5s countdown `TimerBar`. | `tmp/catalog/value-sets/06-value-sets-soft-delete-undo.png` |
| **3.2** | Archived Tab View | Archived status tab | Switch to "Archived" tab. | Lists archived value sets with read-only View modal and Restore action. | `tmp/catalog/value-sets/07-value-sets-archived-tab.png` & `13-archived-tab-view.png` |
| **3.3** | Restore Archived Value Set | Restore action | Click "Restore" on an archived value set. | Confirmation dialog opens; confirming restores value set to Live list with success notification. | `tmp/catalog/value-sets/07-value-sets-archived-tab.png` |

---

#### Group 4: Network, Connection Cap & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **4.1** | Connection Cap Optimization | Mount list in React StrictMode. | Sequential fetch architecture keeps initial burst to ≤ 3 concurrent requests, avoiding Chrome's 6-connection pool stall. | `tmp/catalog/value-sets/09-deep-link-spotlight-immediate.png` |
| **4.2** | Initial Loading Skeletons | Inject 1500ms delay. | `ScrollLoadSkeleton` pulses smoothly without layout shifts. | `tmp/catalog/value-sets/01-value-sets-desktop-list.png` |
| **4.3** | Double-Click Save Guard | Inject 1500ms delay on submit. | Save button disables immediately with inline `Spinner`. | `tmp/catalog/value-sets/04-value-sets-created-row.png` |
| **4.4** | Synthetic Server 500 Fault | Inject 500 on `/admin/v1/value-sets`. | Catches error envelope; shows localized error card with working "Retry". | `tmp/catalog/value-sets/01-value-sets-desktop-list.png` |
| **4.5** | Offline Disconnection Guidance | DevTools offline mode. | Displays localized `errors.offline` guidance notification. | `tmp/catalog/value-sets/01-value-sets-desktop-list.png` |

---

## 14. UI Tests Specification (Category Options Mapping)

### Comprehensive Category Options UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` against category-option configuration endpoints (`apps/api/src/catalog/category.service.ts` at `PUT /admin/v1/categories/:id/options/:optionTypeId`).

```
Group 1: Category Options Dialog & Responsive Layout
Group 2: Option Axis Mapping Configuration & Value Sources
Group 3: Concurrency Conflict Guards & Soft-Delete Undo
Group 4: Network, Loading & Resiliency Tests
```

---

#### Group 1: Category Options Dialog & Responsive Layout

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Open Category Options Dialog | `CategoryOptionsDialog` | Open row menu on Category row; click "Manage Options". | Opens dialog showing category breadcrumb title, mapped options table, and "+ Add Option" header action. | `tmp/catalog/categories/category-options-dialog-open.png` |
| **1.2** | Desktop Table vs Mobile Cards | Responsive breakpoint | View at 1440px desktop vs 375px mobile. | Desktop renders full data table; mobile smoothly transitions to stacked card layout with badges and action buttons. | `tmp/catalog/categories/01-category-options-desktop.png` & `02-category-options-card-view-mobile.png` |
| **1.3** | Ellipsis Title Truncation | Dialog header | Inspect dialog title for deep nested category path. | Breadcrumb path truncates with ellipsis tooltip, preventing dialog header blowout. | `tmp/catalog/categories/ui-options-ellipsis-title.png` |

---

#### Group 2: Option Axis Mapping Configuration & Value Sources

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Add Category Option Modal | Mapping form modal | Click **"+ Add Option"** in dialog header. | Opens modal with Option Type select (filtered to unmapped options), Applicability (`required` vs `optional`), Variant Axis switch, Price Impact switch, and Value Source. | `tmp/catalog/categories/category-options-form-open.png` |
| **2.2** | Map Predefined Value Set | Value source select | Select `predefined` value source. | Value Set dropdown activates; pick assigned Value Set (e.g. "Apparel Sizes"); saves mapping. | `tmp/catalog/categories/category-options-mapped-table.png` |
| **2.3** | Variant Axis & Price Impact Flags | Variant axis switches | Toggle "Variant Axis" (forms buyable SKU) and "Price Impact" (prompts per-variant pricing). | Badges reflect on mapped options table row ("Variant Axis", "Price Impact"). | `tmp/catalog/categories/ui-category-options-mapped-table.png` |
| **2.4** | Edit Existing Option Mapping | Edit mapping modal | Click "Edit" on a mapped category option row. | Prepopulates form; Option Type is locked; checks `expectedUpdatedAt` concurrency token on save. | `tmp/catalog/categories/03-category-options-edit-form.png` |
| **2.5** | Standardized Radix Selects Without Fake Disabled Items | `CategoryOptionsDialog` mapping form | Trigger Option Type, Applicability, or Value Source selects. | All dropdowns use standardized Radix UI Select components at `h-9` without unselectable `__none__` dummy items; triggers display genuine placeholders. | `tmp/catalog/categories/ui-category-options-clean-select.png` |

---

#### Group 3: Concurrency Conflict Guards & Soft-Delete Undo

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Optimistic Concurrency Conflict | Stale write injection | Attempt to save edits when another admin modified mapping in parallel. | Backend returns `409 CONFLICT`; UI catches conflict, displays notification: *"Mapping has changed since you loaded it; please review latest version."* | `tmp/catalog/categories/04-category-options-conflict-toast.png` |
| **3.2** | Soft Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Remove" on a mapped category option row. | Option is optimistically removed from table; single toast notification appears with **"Undo"** and 5s countdown `TimerBar`. | `tmp/catalog/categories/category-options-undo-toast.png` |
| **3.3** | Restore Mapping via Undo | Undo toast action | Click "Undo" on the notification toast. | Option immediately restores to the active table with previous configuration preserved. | `tmp/catalog/categories/category-options-restored-table.png` |

---

#### Group 4: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **4.1** | Initial Dialog Loading Skeletons | Inject 1500ms delay. | Displays skeleton placeholders matching options table structure. | `tmp/catalog/categories/ui-category-options-dialog-active.png` |
| **4.2** | Double-Click Save Guard | Inject 1500ms delay on PUT. | Save button disables immediately with inline spinner. | `tmp/catalog/categories/05-category-options-save-success.png` |
| **4.3** | Synthetic Server 500 Fault | Inject 500 on options route. | Displays localized error card inside dialog with working "Retry". | `tmp/catalog/categories/category-options-dialog-open.png` |
| **4.4** | Offline Disconnection Guidance | DevTools offline mode. | Displays localized connection guidance copy. | `tmp/catalog/categories/category-options-dialog-open.png` |

---

## 15. UI Tests Specification (Category Hierarchy & Tree Management)

### Comprehensive Categories UI Test Suite (Sorted & Grouped)

Verified in `apps/admin` against PostgreSQL `ltree` category services (`apps/api/src/catalog/category.service.ts`).

```
Group 1: Category Tree Navigation & Hierarchy
Group 2: Drag-and-Drop Reordering & Reparenting
Group 3: Category Creation, Editing & Invariants
Group 4: Soft-Delete with Undo & Product Dependency Guards
Group 5: Archived Tab, Restore Lifecycle & Search
Group 6: Network, Loading & Resiliency Tests
```

---

#### Group 1: Category Tree Navigation & Hierarchy

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Hierarchical Tree Overview | `CategoryTree` (`/catalog/categories`) | Navigate to `/catalog/categories` on desktop. | Displays category tree with nested indentation, chevron collapse/expand toggles, Active/Archived/All tabs, and search bar. | `tmp/catalog/categories/01-category-tree-desktop.png` |
| **1.2** | Node Collapse & Expand | Tree node toggles | Click chevron arrow on a parent node with sub-categories. | Smoothly collapses and expands child category branch without layout jump. | `tmp/catalog/categories/01-category-tree-desktop.png` |
| **1.3** | Deep-Link Target Promotion | `useHighlightTarget` | Navigate to `?target=<categoryId>`. | Targeted category node auto-expands in tree and is highlighted with amber tint. | `tmp/catalog/categories/01-category-tree-desktop.png` |
| **1.4** | Mobile Responsive Viewport | Mobile breakpoint | Emulate mobile screen (390×844). | Tree adapts with responsive touch targets, simplified indentation, and mobile action drawer. | `tmp/catalog/categories/02-category-tree-mobile.png` |

---

#### Group 2: Drag-and-Drop Reordering & Reparenting

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Reorder Sibling Categories | Drag handle | Drag category row and drop above/below sibling. | Drop indicator line renders; row moves optimistically; position flash highlights moved row; updates `position` in DB. | `tmp/catalog/categories/01-category-tree-desktop.png` |
| **2.2** | Reparent Category Branch | Tree drop target | Drag category onto a new parent category node. | Backend executes atomic `ltree` transaction updating `path` for the category and all descendants. | `tmp/catalog/categories/01-category-tree-desktop.png` |
| **2.3** | Cyclical Reparenting Guard | Drop validator | Attempt to drag parent category into one of its own descendants. | Drag operation is disallowed / drops inertly, preventing cyclic hierarchy corruption. | `tmp/catalog/categories/01-category-tree-desktop.png` |

---

#### Group 3: Category Creation, Editing & Invariants

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Create Root Category Modal | `CategoryFormModal` (Root) | Click **"+ New category"** button. | Opens modal with Name, auto-slug generator preview, Parent Category (default "None (Root)"), and Description. | `tmp/catalog/categories/03-category-add-modal.png` |
| **3.2** | Create Sub-Category | Parent picker | Select parent from category tree dropdown. | Displays breadcrumb path preview of future category path; saves nested under parent. | `tmp/catalog/categories/03-category-add-modal.png` |
| **3.3** | Edit Category Modal | `CategoryFormModal` (Edit) | Select "Edit" from row 3-dots action menu. | Prepopulates category attributes; saves with `expectedUpdatedAt` concurrency token. | `tmp/catalog/categories/04-category-edit-modal.png` |
| **3.4** | Row Actions Menu | Row action dropdown | Click 3-dots menu on category row. | Displays actions: "Edit", "Options", "Add child", "Archive". | `tmp/catalog/categories/05-category-row-menu.png` |
| **3.5** | Pristine Close Guard | Modal dismiss | Open edit modal and close without modifying fields. | Closes cleanly without prompting dirty-state confirmation. | `tmp/catalog/categories/ui-pristine-edit-closed.png` |

---

#### Group 4: Soft-Delete with Undo & Product Dependency Guards

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Soft Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Archive" on an unused leaf category. | Row optimistically disappears from tree; single toast appears with **"Undo"** and 5s countdown `TimerBar`. | `tmp/catalog/categories/category-options-undo-toast.png` |
| **4.2** | Category Archival Guard on Products (Q32) | Archival guard | Attempt to archive category that has live products assigned. | Intercepts `CATEGORY_HAS_PRODUCTS` (409) conflict; displays localized warning: *"Cannot archive category while N product(s) reference it; re-categorize or archive products first."* | `tmp/catalog/categories/04-category-options-conflict-toast.png` |
| **4.3** | Child Categories Archival Guard | Tree delete guard | Attempt to archive a category that has active child categories. | Backend blocks deletion; UI displays error instructing admin to move or archive sub-categories first. | `tmp/catalog/categories/04-category-options-conflict-toast.png` |

---

#### Group 5: Archived Tab, Restore Lifecycle & Search

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **5.1** | Archived Tab Directory | Archived status tab | Switch to "Archived" tab. | Displays archived categories with hierarchical breadcrumb trails and Restore row actions. | `tmp/catalog/categories/07-category-archived-tab.png` |
| **5.2** | Restore Leaf Category | Restore modal | Click "Restore" on an archived category whose parent is active. | Confirmation modal opens; confirming restores category back to active tree. | `tmp/catalog/categories/07-category-archived-tab.png` |
| **5.3** | Restore Blocked on Archived Parent | Restore guard | Attempt to restore category whose parent is currently archived. | Intercepts `CATEGORY_PARENT_ARCHIVED` (409); displays message: *"Cannot restore category because its parent category is archived; restore parent first."* | `tmp/catalog/categories/07-category-archived-tab.png` |
| **5.4** | Category Search & URL Filter Sync | Search & URL sync | Type search query (e.g. "Apparel"); reload page. | Filtered results display; query persists in URL query parameters (`?q=Apparel`). | `tmp/catalog/categories/08-category-search-filter.png` |

---

#### Group 6: Network, Loading & Resiliency Tests

| # | Test Scenario | Injection / Dev Condition | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|
| **6.1** | Initial Tree Loading Skeletons | Inject 1500ms delay. | Renders tree skeleton lines with hierarchical indents during fetch. | `tmp/catalog/categories/ui-category-options-dialog-active.png` |
| **6.2** | Double-Click Mutation Guard | Inject 1500ms delay on PUT/POST. | Submit button enters disabled state with inline `Spinner`. | `tmp/catalog/categories/05-category-options-save-success.png` |
| **6.3** | Synthetic Server 500 Fault | Inject 500 status on category route. | Catches error envelope; displays localized error card with working "Retry". | `tmp/catalog/categories/04-category-edit-modal.png` |
| **6.4** | Offline Disconnection Guidance | DevTools offline mode. | Triggers `errors.offline` connection guidance banner. | `tmp/catalog/categories/04-category-edit-modal.png` |
| **6.5** | Tree-View Load Error & Retry | Inject synthetic failure on initial category tree load (`listCategories`). | Renders localized error line (`list.loadError`: *"Couldn’t load the list."*) with working "Try again" button; clicking "Try again" clears error state and re-fetches. | `tmp/catalog/categories/04-category-edit-modal.png` |

---

## Changelog

- 2026-10-28 — Remediated Soft-Deleted Option In-Use Guard & Soft-Delete Reload Polish:
  - **Soft-Deleted Variant In-Use Guard (Scenario 2.7)**: Fixed `ProductOptionService.remove` so `usedByVariant` only counts active variants (`deletedAt: null`), allowing options to be removed cleanly when all variants on a product have been deleted; purged soft-deleted variants using the removed option in the delete transaction; updated `assertSkuFree` and `create` in `VariantService` to prevent conflicts with soft-deleted variants; added selection validation in `VariantService.restore`.
  - **Optimistic Soft-Delete & Silent Background Resync (Scenario 3.6)**: Added `onOptimisticRemove` and `onOptimisticRestore` hooks to `useSoftDeleteWithUndo` and wired into `ProductVariantsDialog`, `ProductList`, `ProductOffersDialog`, `BrandList`, `OptionTypeList`, and `ValueSetList`; decoupled `resync` in `ProductVariantsDialog` (`resyncVariants`, `background: true`), eliminating full-list skeleton flashes on both delete and undo.

- 2026-10-29 — Remediated Group 4 Product Media Gallery UI/UX, Validation & Read-Only Invariants (Punch-list Items 21–32):
  - **1-Based Position Badges (Scenario 4.3, Item 21)**: Mapped card position badges to human-friendly 1-based numbering (`pos {asset.position + 1}`) across initial add, list load, and drag/button reorder operations while preserving standard 0-indexed database storage.
  - **Video Preview Modal Close Collision & Mobile Footer Stacking (Scenario 4.13, Item 22)**: Added `pr-12` to `ModalHeader` to eliminate collision between top-right `OverlayCloseButton` (`✕`) and header action buttons (`[Open original]`); re-ordered `ModalFooter` flex layout on mobile viewports so playback speed controls render on top and the full-width Close button renders underneath.
  - **Form Validation & Native Bubble Suppression (Scenario 4.10, Item 23)**: Added `noValidate` to `MediaFormModal`'s `<form>` and stripped native browser constraints (`min="1"`) from numeric inputs, eliminating native HTML5 constraint bubbles and enforcing clean design-system inline red error copy evaluated on form submit (`mode: 'onSubmit'`).
  - **Archived & Pending View-Only Guard on Video Preview & Edit Modals (Scenario 4.11, Item 24)**: Passed `readOnly={isReadOnly}` to `VideoPreviewModal` and hid "Edit details" when viewing media of archived or pending products; added `readOnly` defense-in-depth enforcement to `MediaFormModal` disabling fieldsets and hiding mutation actions.
  - **Option Tagging Localized Labels & Dropdown Width (Scenario 4.12, Item 25)**: Updated option tagging dropdown in media cards to resolve human-readable localized labels (`ov?.label.en ?? v.code`) from `optionTypeMap` rather than displaying raw technical slug codes (`redish`); set `min-w-[9rem] max-w-[20rem]` on `SelectContent` to prevent narrow-cell truncation.
  - **Unchanged Edit Save Bypass (Item 26)**: Added `!isDirty` check to `MediaFormModal` on edit mode, cleanly closing the modal without firing redundant backend `PATCH` requests or false success toasts.
  - **Unsaved Changes Discard Confirmation (Item 27)**: Wired `isDirty` with `ConfirmDialog` in `MediaFormModal` prompting the user with standard discard confirmation copy when dismissing with unsaved edits.
  - **Silent Re-Sync on 409 Conflict (Item 28)**: Added conflict tracking in `MediaFormModal` triggering silent background `loadData()` upon dismissal after an OCC error, allowing immediate re-editing without closing the parent gallery.
  - **Delete Confirm Modal Auto-Close on Error (Item 29)**: Moved `setDeleteTarget(null)` into `finally` block in `handleConfirmDelete`, ensuring the delete confirmation modal dismisses on failure to reveal the red error banner in the parent gallery.
  - **Media Reorder Controls Filter Scoping (Scenario 4.7, Item 30)**: Restricted `Move Left` and `Move Right` buttons strictly to the `All` tab (`isAllTab = activeFilter === 'all'`), omitting reorder controls when viewing filtered subsets (`General` / `Variant-Specific`) to prevent out-of-order partial swaps with invisible items and preserving a single authoritative gallery sequence.
  - **Make Cover Button Tag Scoping (Scenario 4.7, Item 31)**: Restricted the "Make Cover" button to untagged assets (`asset.tags.length === 0 && !isCover`), adhering strictly to `plan/26 §5` where variant-tagged assets serve as Variant Leads and cannot serve as the product cover.
  - **In-Place Media Save State Update (Item 32)**: Implemented `handleMediaSaved(savedAsset)` in `ProductMediaDialog` updating `mediaAssets` locally in-place on add and edit, eliminating redundant `loadData()` invocations, skeleton flashing, and 4 parallel network refetches. Added `{ background: true }` support for silent OCC conflict resyncs.

- 2026-10-28 — Remediated Catalog Options & Variants UI findings (Group 2 & Group 3 punch-list items 16–20):
  - **Archived Products Row Actions (Scenario 2.9, 3.11, Item 16)**: Added missing 'Configure Options' and 'Manage Variants' row menu items for archived products in `ProductList`, providing access to their read-only dialogs.
  - **Actions Column Header Suppression in Read-Only Mode (Scenario 2.9, Item 17)**: Hidden the 'Actions' `<th>` and `<td>` in `ProductOptionsDialog` when in view-only / read-only mode, eliminating the orphaned empty column header.
  - **Option Delete Confirm Dialog Auto-Close on Rejection (Scenario 2.7, Item 18)**: Auto-closed `OptionDeleteConfirmModal` upon in-use conflict rejection (`409 CONFLICT`), allowing immediate visibility of the localized error banner on the parent dialog.
  - **Toast Interaction Guard for Modals & Drawers (Scenario 3.6, Item 19)**: Implemented `isToastInteraction` in `@shopnetic/ui` so `ModalContent` and `DrawerContent` ignore outside interactions inside `[data-sonner-toaster]` or `[data-sonner-toast]`, preventing soft-delete 'Undo' toast clicks from closing open dialogs.
  - **Variant Dimensions Positive Number Hardening (Scenario 3.10, Item 20)**: Replaced untyped `dims` in `@shopnetic/contracts` with `variantDimsSchema` enforcing positive integers (`> 0`) for `length`, `width`, and `height`, tightened `variantFormSchema` validation in `ProductVariantsDialog` to reject `0mm`, and updated `catalog.json` error copy.

- 2026-10-28 — Remediated & Hardened Products UI Sweep Punch-List (Scenarios 1.1–1.18):
  - **3P Moderation Payload (Scenario 1.8)**: Updated `ProductFormModal` (`submitWithStatus`) in review mode to dispatch minimal status-only payloads (`{ status, expectedUpdatedAt, ...(spec ? { spec } : {}) }`), omitting immutable product attributes (`title`, `slug`, `brandId`, `basePriceMinor`, `currency`, `description`) to satisfy backend `PRODUCT_IN_REVIEW` (422) guard on approval and rejection.
  - **Select Typeahead in Modals (Scenario 1.5, Monorepo-Wide)**: Resolved Radix UI focus-trap conflict where `Dialog` focus scope prevented in-modal `Select` typeahead and keyboard navigation by overriding `@radix-ui/react-focus-scope` to `1.3.1` across the monorepo workspace.
  - **Restore Dialog Copy (Scenario 1.10)**: Added dedicated `restoreTitle` ("Restore product?") and `restoreMessage` ("“{name}” will be moved back to the live list.") i18n keys in `catalog.json` and updated `ProductList`, replacing premature past-tense toast reuse.
  - **Create Modal Autofocus & Draft Indicator (Scenario 1.4)**: Added `initialFocusRef` prop to `FormModal` and bound to the Title input in create mode; rendered clear `StatusBadge` ("Draft") and explanatory hint (`defaultDraftHint`) in create mode.
  - **Base Price Leading-Zero Normalization (Scenario 1.5)**: Added `normalizeDecimalString` on blur in `numeric-input.ts` to strip non-numeric characters and trim leading zeros (e.g. `0000000` -> `0`, `0019.99` -> `19.99`).
  - **Design-System Disabled Field Contrast & Editor Non-Editable Ring (Scenarios 1.7, 1.17)**: Upgraded disabled form controls across `packages/ui` (`Input`, `Select`, `PasswordInput`, `Checkbox`, `Switch`, `OtpInput`) from `disabled:opacity-50` to `disabled:opacity-75 disabled:bg-muted/40` for WCAG AA readability; suppressed focus rings and pointer events on the non-editable description editor when disabled.
  - **Products List Default Status Filter (Scenario 1.1)**: Defaulted Products list status filter to `"all"` on initial load when no URL parameter is provided.
  - **TipTap Description Editor Enhancements (Scenario 1.17)**: Added symmetrical table commands (Add row before/after, Add column before/after, Delete row/column/table); updated Table popover with `hideClose` to eliminate "3×3" badge crowding; replaced apparel-specific templates with category-neutral localized templates in `next-intl` (Features & Specifications, Care & Maintenance, Why You'll Love It); distinguished Link popover title ("Edit link").
  - **BFF Dev-Debug Header Forwarding (Infrastructure)**: Whitelist-forwarded incoming `x-debug-*` headers (`x-debug-fault`, `x-debug-delay`) and `x-correlation-id` through Next.js BFF proxy route handlers to the upstream NestJS API.

- 2026-10-26 — Hardened & Remediated TipTap Description Editor & Video Playback (Scenarios 1.17, 4.13): resolved create-mode draft recovery collision by automatically clearing `shopnetic:draft:product-desc:create` from `sessionStorage` upon modal cancel/close, component unmount (in-app route navigation with React StrictMode-resilient delayed cleanup), and creation in `ProductFormModal`; isolated `EditorToolbar` into a memoized subcomponent with referentially stable `onToggleFullscreen` (`useCallback`) subscribing to TipTap `selectionUpdate` and `transaction` events, preventing unnecessary parent editor re-renders on cursor movements while maintaining immediate active highlight responsiveness; hardened fullscreen Escape handling in `RichTextEditor` to close open toolbar popovers (table, emoji, link, templates) before exiting the fullscreen overlay with `stopImmediatePropagation()`, preventing premature parent modal dismissal; constrained `productDescriptionTableCellAttrsSchema` align attribute to `z.enum(['left', 'center', 'right'])` matching TipTap table cell capabilities while allowing justify on paragraphs and headings; synchronized DOM `<video>.playbackRate = 1` on asset switch in `VideoPreviewModal`; purged orphaned i18n keys (`capturePoster`/`frameCaptured`); added poster image `onError` fallback in gallery cards; expanded unit tests (`rich-text-editor.test.tsx` 25/25 green, `product-form-modal.test.tsx` 25/25 green, `product-media-dialog.test.tsx` 21/21 green; 553/553 admin unit tests, 41/41 API unit tests, 218/218 API integration tests, 23/23 monorepo tasks clean).

- 2026-10-23 — Implemented Tables, Text Alignment, Sub/Superscript, Emoji Picker, Draft Recovery & Video Controls (Scenarios 1.17, 4.13): extended TipTap ProseMirror schema in `@shopnetic/contracts` with `table`, `tableRow`, `tableHeader`, `tableCell`, `textAlign` (left/center/right/justify), `superscript`, and `subscript`; updated `docToPlainText` to format tables with tab/newline delimiters and updated `isDocEmpty` to treat table elements as non-empty; added toolbar controls for Superscript, Subscript, Align Left, Align Center, Align Right, Align Justify, Table Popover (Insert 3×3, Add/Delete Row, Add/Delete Column, Delete Table), Curated Emoji Popover, and `sessionStorage` draft recovery banner with one-click Restore and Discard; hardened `RichTextEditor` with semantic document comparison (`areDocsEqual`) and `{ emitUpdate: false }` prop sync preventing false form dirtiness and unneeded edit mutations; enhanced `VideoPreviewModal` with Fullscreen toggle (`requestFullscreen`), "Edit details" modal transition to `MediaFormModal`, and "Capture poster frame" timestamp badge; added unit tests in `rich-text-editor.test.tsx` (18/18 green) and `product-media-dialog.test.tsx` (20/20 green); and confirmed full green quality gates across all workspaces (541/541 admin unit tests, 41/41 api unit tests, 218/218 api integration tests, 23/23 turborepo tasks).

- 2026-10-24 — Remediated & Hardened Video Preview Playback & TipTap Description Editor (Scenarios 1.17, 4.13): resolved 5 draft recovery bugs in `RichTextEditor` by scoping `sessionStorage` draft keys per product (`shopnetic:draft:product-desc:${id ?? 'create'}`) to eliminate cross-product collisions, re-validating drafts against `productDescriptionDocSchema.safeParse` prior to restoration, auto-clearing drafts on successful save in `ProductFormModal`, sorting document keys recursively in `cleanDoc` to prevent Postgres JSONB key-reordering false positives/negatives, and completely suppressing draft banner/persistence in read-only/review mode (`disabled=true`); prevented Escape key from dismissing parent form modal when exiting fullscreen editor mode via capture-phase listener with `stopImmediatePropagation`; added `align` cell attribute to `productDescriptionTableCellAttrsSchema` and rewrote `isDocEmpty` with recursive tree walker detecting nested tables; wired reactive toolbar active state updates on pure cursor movements via `onSelectionUpdate`/`onTransaction`; synchronized video playback speed selector with native controls via `onRateChange` and reset to 1x on video change; connected "Capture poster frame" to pre-fill `posterKey` (`${fileKey}#t=${time}`) in `MediaFormModal`; updated unit test suites (`rich-text-editor.test.tsx` 22/22 green, `product-media-dialog.test.tsx` 21/21 green, `product-description.test.ts` 9/9 green; 546/546 admin tests, 41/41 API unit tests, 218/218 API integration tests, 23/23 monorepo tasks clean).
- 2026-10-23 — Implemented E-Commerce Enhancements for Video Preview & TipTap Description Editor (Scenarios 1.17, 4.13): upgraded `VideoPreviewModal` with `muted` attribute (resolving browser autoplay-with-sound blocking policy), interactive playback speed switcher (`0.5x`, `1x`, `1.25x`, `1.5x`, `2x`), 'Open original' external file link, and previous/next gallery video navigation with asset counter badge and keyboard arrow navigation; enhanced `RichTextEditor` with continuous live word and character counters in the footer bar alongside the 50KB JSON byte gauge (`X words • Y characters | Z KB / 50 KB`), full-screen distraction-free overlay mode with Escape keyboard shortcut exit, and reusable content templates dropdown inserting valid AST blocks (Features & Specifications, Materials & Care, Highlights & Story); polyfilled standard `Range.prototype.getClientRects` and `Range.prototype.getBoundingClientRect` in `vitest.setup.ts` preventing JSDOM ProseMirror coordinate calculation errors on selection focus; added 1 unit test in `product-media-dialog.test.tsx` (17/17 green) and 3 unit tests in `rich-text-editor.test.tsx` (13/13 green); and updated Section 10 UI Tests Specification.
- 2026-10-23 — Executed Comprehensive Architecture & Codebase Sweep (Catalog Products & Inventory): compiled Master Validation & Resilience Matrix across all 10 forms and modals; verified PostgreSQL and NestJS modular monolith as Single Source of Truth (SSoT) with closed Zod pipes and defensive read transformations (`toDescriptionView`); audited plain-text sanitization in `ProductService.toAuditSnapshot` and `diff.ts`; documented multi-token search scoring haystack scope (Title and Slug) isolating ProseMirror AST JSON; added 7 client-side field validation and server error mapping tests in `product-form-modal.test.tsx` (empty title, invalid/reserved slug, decimal price rules, `PRODUCT_SLUG_TAKEN`, `PRODUCT_BRAND_REQUIRED`, `PRODUCT_BRAND_NOT_ALLOWED`, `VALIDATION_ERROR`); added Scenario 1.18 to Section 10 UI Tests Specification; persisted architecture sweep report in `plan/26-architecture-sweep-report.md`; and verified all unit/integration test suites (529/529 admin unit tests, 39/39 api unit tests, 218/218 api integration tests, 23/23 monorepo tasks).
- 2026-10-23 — Hardened Rich Description Security, Accessibility & Link Insertion (B3 Polish): patched WHATWG URL standard tab/newline stripping bypass (`[\t\n\r\0]` rejection in `isValidDescriptionLinkHref` and `PRODUCT_DESCRIPTION_LINK_HREF_REGEX`) preventing open-redirect host escapes like `/\t/evil.com`; aligned accessibility by binding `id` directly to TipTap's `contenteditable` container (`editorProps.attributes`) and implementing dedicated `label[for]` click-to-focus delegation without redundant hidden inputs or Chrome `aria-hidden="true"` console interventions; enforced bounded height (`min-h-[140px] max-h-[260px] overflow-y-auto`) with a pinned formatting toolbar; enhanced link popover to require display text when cursor selection is empty while skipping text input when editing highlighted text; asserted explicit `VALIDATION_ERROR` (422) on HTTP boundary ZodBodyPipe rejections; and verified all 10 unit tests in `rich-text-editor.test.tsx`, 14 in `product-form-modal.test.tsx`, and 15 integration tests in `product.service.integration.test.ts` (522/522 admin tests, 39/39 api unit tests, 218/218 api integration tests, 23/23 monorepo tasks).
- 2026-10-22 — Implemented TipTap ProseMirror Rich Product Description Editor (B3 Phase A, Scenario 1.17): introduced structured ProseMirror/TipTap JSON AST schema (`@shopnetic/contracts/src/catalog-description.ts`) with strict node/mark allowlist (`doc`, `paragraph`, `heading` [levels 2, 3], `bulletList`, `orderedList`, `listItem`, `blockquote`, `horizontalRule`, `hardBreak`, `text`, `bold`, `italic`, `strike`, `link`), protocol validation for links (`http(s)://`, `mailto:`, `tel:`, `/` with protocol-relative escape rejection), 50,000-byte true UTF-8 JSON size cap, and backward-compatible string-to-doc wrapping; updated `productSchema`, `createProductRequestSchema`, `updateProductRequestSchema`, and `ProductService.toView()` in backend modular monolith; hardened TipTap StarterKit with `underline: false` to prevent unallowed marks via Ctrl+U; converted audit log descriptions to human-readable plain text via `docToPlainText` in `ProductService` and `diff.ts`; built accessible `RichTextEditor` (`apps/admin/src/features/catalog/products/rich-text-editor.tsx`) featuring 13-action formatting toolbar, anchored Link Popover dialog, byte size indicator near limits, accessible screen-reader textarea synchronization with focus forwarding, and container click-to-focus; wired into `ProductFormModal` via `Controller`; verified full unit and integration test suites (522/522 admin tests, 39/39 api unit tests, 218/218 api integration tests, 23/23 monorepo tasks); and documented Scenario 1.17 in Section 10 UI Tests Specification.
- 2026-10-22 — Implemented Video Preview Playback Modal (B10, Scenario 4.13): made video media card play badges interactive (`aria-label={t('products.media.playPreview')}`) in `ProductMediaDialog` (`apps/admin/src/features/catalog/products/product-media-dialog.tsx`); introduced `VideoPreviewModal` displaying `<video src={asset.fileKey} poster={asset.posterKey} controls autoPlay />` with title, duration metadata, and fallback error handling for broken or unreachable media keys; verified video unmounts cleanly on close/escape to halt playback; added 2 unit tests in `product-media-dialog.test.tsx` (16/16 green); and documented Scenario 4.13 in Section 10 UI Tests Specification.
- 2026-10-22 — Enforced Defense-in-Depth Required Options Guard on Product Creation: hardened `ProductService.create()` (`apps/api/src/catalog/product.service.ts`) to verify `categoryOption` for required axes when `input.status === 'active'`, throwing `PRODUCT_OPTION_NOT_CONFIGURED` (422) if required category options exist, ensuring direct API calls cannot bypass activation invariants; added integration test coverage; and aligned test description in `product-media-dialog.test.tsx`.
- 2026-10-22 — Implemented Search Relevance Ranking, Seller Disambiguation & Integration Test Teardown: enhanced shared `buildTokenSearch` (`apps/api/src/common/text-search.ts`) with multi-tier weighted relevance scoring (exact phrase matches +10, all-tokens match +5, primary-field matches +2 per token, primary full phrase +10, prefix +10, exact title +20) and integrated `primarySql` across Product, Category, Brand, OptionType, and ValueSet services; disambiguated seller picker entries in `WarehouseFormModal` and `OfferFormModal` with unique shop slug / ID handles (`${name} (${typeTag}) • @${slug}`); added teardown in `afterAll` across `inventory.service.integration.test.ts`, `variant.service.integration.test.ts`, and `seller.service.integration.test.ts` preventing test fixture accumulation; purged 209 orphan products and 97 duplicate sellers from local development database; and added dedicated search-ranking unit and integration test assertions.
- 2026-10-22 — Implemented Catalog & Admin UX & Resilience Polish (Scenarios 1.13, 6.13, 1.6, 6.5): resolved offline navigation crash by switching `useUrlParamsSync` to direct `window.history.replaceState` (avoiding background RSC fetch on query param updates); resolved status filter carry-over bug in `BrandList` by resetting `statusFilter` to `'all'` when switching to or mounting on the `Archived` tab (via manual click or deep-link target); unified category tree-view error copy with shared `{tCommon('list.loadError')}`; and updated `ProductList` desktop table row and mobile card to a flexible 2-line title layout with `line-clamp-2`, `break-words`, and an optically aligned top-right origin badge (`1P`/`3P`).
- 2026-10-21 — Hardened Multi-Warehouse, 3P Seller Scoping & Offers/Stock UI Sync (Batch 6): updated `WarehouseService.list(sellerId?: string)` to accept optional `sellerId` and return all active warehouses across sellers when omitted; updated `AdminWarehouseController.list` to forward query param without hardcoded `shopnetic-retail` fallback; added seller picker dropdown to `WarehouseFormModal` with UUID validation (`err.sellerRequired`), generic subtitle, and responsive address grid (`grid-cols-1 sm:grid-cols-2`); fixed `StockAdjustModal` input vertical misalignment by switching grid from `items-end` to `items-start`, and guarded row state initialization to preserve user edits across array churn; defaulted offer form price to empty string when creating new offers; hardened `ProductOffersDialog` with `selectedVariantIdRef` and `lastSyncedInitialVariantIdRef` preventing active tab snap-back on delete resync, retry, or delayed undo callbacks; memoized `sellerWarehouses` for `StockAdjustModal` and updated `handleStockUpdated` to keep `stockAdjustState.offer` in sync; rendered neutral "Backorder Available" badge in offers table stock cell; and added `{variants.length}` count badge in `ProductVariantsDialog` header.
- 2026-10-21 — Implemented systemic reactive modal boundary containment for floating select dropdowns (Batch 5, B11 hardening): introduced `ModalBoundaryContext` and `useModalBoundary` in `@shopnetic/ui` so `ModalContent` reactively captures and provides its mounted DOM element to all descendant components; enhanced `SelectContent` in `@shopnetic/ui` to automatically bind `collisionBoundary` to the enclosing modal (with fallback to caller override) and `collisionPadding={8}`, resolving overflow risk across all modal+Select combinations in the monorepo; applied `min-w-0 flex-1` cell-width flexbox hardening and `align="end"` to compact right-aligned selects in `ProductMediaDialog` (media option tagging) and `ProductOptionsDialog` (Single Value Skip picker); added dedicated integration test in `media.service.integration.test.ts` asserting `media.listForOwner` succeeds on pending products while mutations reject with `PRODUCT_IN_REVIEW` (409); added unit test suite in `select-boundary.test.tsx` verifying reactive boundary propagation, deferred async mounting, sibling modal transitions without leakage, and nested modal scoping; updated Section 10 UI Tests Specification (Scenarios 4.12, 6.9, 6.10, 6.11, 6.12) and `plan/22-risks-and-open-questions.md` (Q35, R21).
- 2026-10-21 — Remediated Catalog Options, Variants & Moderation hardening (Batch 4): gated `PRODUCT_IN_REVIEW` (409) behind `!allowArchived` in `ProductOptionService`, `VariantService`, and `MediaService` so that read operations (`list()`) on pending products cleanly return data while mutations remain locked; removed ungated Delete action from pending product row menu in `ProductList` and guarded backend `ProductService.remove` with `PRODUCT_IN_REVIEW` (422) to enforce that pending proposals must be processed via review; localized "Pending Review" and "Archived" badge labels via `t('products.status.*')` and unified `isArchived` detection across all 4 product sub-dialogs (`ProductOptionsDialog`, `ProductVariantsDialog`, `ProductMediaDialog`, `ProductOffersDialog`); wired `productSpecSchema` as the single source of truth for `product.spec` across `productSchema`, `createProductRequestSchema`, and `updateProductRequestSchema` in `@shopnetic/contracts`; added tests for pending list reads, delete rejection, reject without note, stock adjustment on pending products, and vendor proposal banner fallback when seller lookup fails; updated Section 10 UI Tests Specification (Scenarios 1.7, 2.1, 2.9, 3.2, 3.11, 4.11, 5.6).
- 2026-10-20 — Implemented Catalog Options, Variants & Moderation hardening (Batch 4): locked product fields in review mode (`ProductFormModal`) and enforced backend validation rejecting field edits on pending products with `PRODUCT_IN_REVIEW` (422); guarded `pending -> active` transitions with `Permission.PRODUCT_APPROVE` and audit log `catalog.product_approved`; implemented rejection feedback modal saving `spec.rejectionNote` / `spec.rejectedAt` with audit log `catalog.product_rejected`; closed side-doors across all sub-services (`ProductOptionService`, `VariantService`, `MediaService`, `OfferService`, `StockService`) rejecting mutations on pending products (`PRODUCT_IN_REVIEW` 409) and archived parents (`PRODUCT_PARENT_ARCHIVED` 409); established view-only gating across all 4 product sub-dialogs (`ProductOptionsDialog`, `ProductVariantsDialog`, `ProductMediaDialog`, `ProductOffersDialog`) for both archived and pending products with "Pending Review" and "Archived" status badges and descriptive subtitles; resolved vendor proposal attribution banner directly via `getSeller(sellerId)` endpoint; added backend activation guard requiring category options to be configured (`PRODUCT_OPTION_NOT_CONFIGURED` 422); enhanced `ProductOptionsDialog` with empty required axis detection banners, swatch hex indicators on offered value pills, and localized Single Value Skip dropdown; hardened `GeneratorModal` with explanatory warning banner identifying empty axes when combos = 0; updated Section 10 UI Tests Specification (Scenarios 1.7, 2.1, 2.9, 3.2, 3.11, 4.11, 5.6).
- 2026-10-20 — Migrated Catalog instance modals (`VariantFormModal`, `MediaFormModal`, `OfferFormModal`, `WarehouseFormModal`) to `react-hook-form` + `@hookform/resolvers/zod` + Zod schemas with localized inline field errors, and hardened `StockAdjustModal` with numeric keystroke/paste restrictions and row-level inline error states; implemented numeric keystroke prevention and paste sanitation utilities (`apps/admin/src/lib/numeric-input.ts`) for integer dimensions, weights, quantities, and decimal prices; established single-source-of-truth currency module in `@shopnetic/contracts` with ISO allowlist validation, zero-decimal currency (JPY) minor unit support, and server-side cross-field validation rules for offers; updated Section 10 UI Tests Specification (Scenarios 3.10, 4.10, 5.17, 5.18, 5.19).
- 2026-10-20 — Extended Optimistic Concurrency Control (OCC) across Variant, MediaAsset, ProductOption, Warehouse, and Seller via `expectedUpdatedAt` contract schemas and 409 CONFLICT checks; added `POST /admin/v1/products/:productId/variants/:id/restore` endpoint with active-state (`VARIANT_ALREADY_ACTIVE`), combo-collision (`VARIANT_COMBO_EXISTS`), and archived-parent (`PRODUCT_PARENT_ARCHIVED`) guards; wired Variant soft-delete to `useSoftDeleteWithUndo` with 5s countdown timer toast; added destructive `OptionDeleteConfirmModal` for ProductOption delete; preserved hand-managed `category_path_gist_idx` index in migration; ensured ProductList create tab-switching resets secondary filters; added Seller OCC and variant restore integration/unit test suites; and implemented pin-to-top spotlight highlighting on create across Product, Brand, OptionType, and ValueSet lists.
- 2026-10-15 — Updated UI Tests Specifications (Sections 10, 11, 12, 13, 14) for unified Radix Select architecture across Catalog domain: elevated SelectContent (z-[60]), solid base background with white text on selected item, lighter tint on hover without ticks, removal of synthetic `__none__` dummy items, automatic single-warehouse selection with empty state fallbacks in offer creation, and complete test verification sweep across Brands, Option Types, Value Sets, Categories, and Products.
- 2026-10-15 — Updated Section 10 UI Tests Specification with backend-denormalized variant combination option names and labels (eliminating raw UUID fallbacks), row-wise mobile footer button wrapping in ProductVariantsDialog, responsive StockAdjustModal header layout, concise 1P/3P origin badges, labeled mobile card rows (eliminating ambiguous bullet chains), and capForMessage string truncation across dynamic select dropdowns.
- 2026-10-15 — Updated Section 10 UI Tests Specification with Grouped Popover Filters, Clear filters action, reactive pending review list removal, clean no-op edit save bypass, pre-archive status restoration, text truncation tooltips, single-line tabular prices, small viewport (<1200px) responsive card views, and refreshed dedicated verification screenshots (12-products-filters-popover-open, 13-products-status-filter-reset, 14-products-cell-truncation-and-price, 15-products-archived-reference-names).
- 2026-10-09 — Added Section 15 (Category Hierarchy & Tree Management) UI Tests Specification relocated from plan/11; synchronized Section 10 Buy-Box and variant delimiter invariants; updated Sections 11 (Brands), 12 (Option Types), 13 (Value Sets), and 14 (Category Options) UI Tests Specifications; updated build progress for Inventory & Buy-Box features.
- 2026-08-31 — Initial draft.
