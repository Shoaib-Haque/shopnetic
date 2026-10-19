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
| **1.1** | Desktop Products List & Grouped Filters Popover | `ProductList` (`/catalog/products`) | Navigate to `/catalog/products` on desktop viewport (1440×900). | Displays header, search bar (`/` shortcut), grouped `Filters` popover button with active filter counter badge, and product table with Origin (1P/3P) and Status badges. | `tmp/catalog/products/01-products-desktop-list.png` |
| **1.2** | Grouped Filter Popover & Clear Action | `ProductList` filters popover | Click "Filters" trigger button; adjust Status ("Draft"), Origin ("In-House (1P)"), Category, or Brand. | Popover mounts grouped controls; list updates smoothly; active filter badge increments; "Clear filters" button clears secondary filters and resets to Active view. | `tmp/catalog/products/12-products-filters-popover-open.png` |
| **1.3** | Debounced Search | `ProductList` token search | Type query into search input (e.g. "Cotton"). | 250ms debounced token search fires once typing settles without UI stutter or duplicate requests. | `tmp/catalog/products/04-products-filter-and-search.png` |
| **1.4** | Create 1P Product Modal | `ProductFormModal` | Click **"+ Add Product"** button. | Opens `ProductFormModal` with autofocus on Title input, auto-slug generator preview, Category select, Brand select, Base Price, Currency, and default Draft status. | `tmp/catalog/products/02-products-create-modal.png` |
| **1.5** | Save 1P Product & Highlighting | `ProductFormModal` → `ProductList` | Fill required fields and submit. | Modal closes, success toast fires, new product appears pinned at top of list with amber highlight tint via `useHighlightTarget`. | `tmp/catalog/products/03-products-created-row.png` |
| **1.6** | Category Locked Invariant on Edit | `ProductFormModal` (Edit mode) | Click "Edit" on an existing product in row menu. | `ProductFormModal` opens in edit mode; Category field is rendered as an immutable read-only badge with explanatory hint; Title, Brand, and Description remain editable. | `tmp/catalog/products/05-products-edit-modal-locked-cat.png` |
| **1.7** | 3P Vendor Proposal Moderation | Moderation banner (`ProductFormModal`) | Click "Review" on a 3P `pending_review` product row. | Opens moderation modal displaying vendor attribution banner, locked category, and action buttons: **"Approve & Publish"** and **"Reject to Draft"**. | `tmp/catalog/products/06-products-review-modal-vendor-3p.png` |
| **1.8** | Approve & Publish Workflow & Reactive Removal | Moderation action | Click "Approve & Publish" in review modal on pending review list. | Product status transitions to `active`; modal closes; product is reactively removed from the pending list view without a full page reload if active filter is pending. | `tmp/catalog/products/07-products-approved-active.png` |
| **1.9** | Soft-Delete with Undo Toast | `useSoftDeleteWithUndo` | Click "Archive" from product row dropdown menu. | Product is optimistically removed from list; single toast notification appears with actionable **"Undo"** button and 5s `TimerBar` progress countdown. | `tmp/catalog/products/08-products-soft-delete-undo.png` |
| **1.10** | Archived Tab & Status-Preserving Restore | `ProductList` (Archived view) | Switch to "Archived" status; click "View details" or "Restore" on archived product row. | "View details" opens read-only inspection modal with disabled inputs and no save button; "Restore" restores product to its exact pre-archive status (preserved in `spec._previousStatus`); success notification displayed. | `tmp/catalog/products/09-products-archived-tab.png` |
| **1.11** | Responsive Breakpoints (<1200px Card View) | `ProductList` & Modals | Emulate viewports between 390px and 1200px. | Desktop table switches to responsive card list below `xl` (1200px); desktop table wraps in horizontal scroll container (`min-w-[900px]`); modal headers use `pr-10/12` clearance so close button never overlaps titles or action buttons. | `tmp/catalog/products/10-products-mobile-cards.png` |
| **1.12** | Secondary Filter Reset on Status Change | Status dropdown (`ProductList`) | With secondary filters set (search query, origin, category, brand), switch status in popover. | Secondary filters and search query automatically reset to default empty state, preventing false 0-result empty states in destination status. | `tmp/catalog/products/13-products-status-filter-reset.png` |
| **1.13** | Cell Truncation, Tooltips & Single-Line Price | `ProductList` table cells | Inspect long titles, categories, and brands on narrow viewports. | Text truncates with ellipsis with full-text `title=` hover tooltips; base price is fixed-width `tabular-nums font-mono whitespace-nowrap` (no wrapping into two lines); unbranded items display `—`. | `tmp/catalog/products/14-products-cell-truncation-and-price.png` |
| **1.14** | Clean Edit No-Op Save Bypass | `ProductFormModal` (Edit mode) | Open edit modal on an existing product without making changes (`!isDirty`) and click save. | Clean modal skips the redundant backend PUT request and closes immediately; modified/dirty forms proceed with standard mutation and optimistic concurrency check. | `tmp/catalog/products/05-products-edit-modal-locked-cat.png` |
| **1.15** | Archived Reference Name Resolution | `ProductOptionsDialog` & `ProductList` | Open product options or product list referencing archived option types, categories, or brands. | Resolves human-readable names (`optionTypeName.en`, `category.name.en`, `brand.name`) instead of raw UUID strings; displays fallback localized badges when archived. | `tmp/catalog/products/15-products-archived-reference-names.png` |
| **1.16** | Mobile Card Labeled Layout & Inline 1P/3P Badge | `ProductList` (<1200px) | Inspect responsive card rendering on small viewports with missing brands or prices. | Renders structured labeled rows: title with adjacent inline origin badge (1P/3P), slug, category, Brand ("Brand: X" or "Brand: —"), Base Price ("Base Price: X" or "Base Price: —"), and Status; eliminates ambiguous bullet chains ("•—•—"). | `tmp/catalog/products/10-products-mobile-cards.png` |

---

#### Group 2: Product Options Configuration & Governance

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Missing Required Axes Alert | `ProductOptionsDialog` | Open row menu on product and click "Configure Options". | `ProductOptionsDialog` opens; if mandatory category axes are unconfigured, renders top alert banner: *"This product is missing required category options: [AxisName]"*. | `tmp/catalog/products/options-variants/01-product-options-dialog-missing-required.png` |
| **2.2** | Add Option Axis from Category | `ProductOptionsDialog` axis pool | Select required option (e.g. Size) from category pool dropdown; click "Add Option Axis". | Option added to table with "Variant Axis" and "Required by Category" badges; missing required banner dismisses. | `tmp/catalog/products/options-variants/02-option-size-added.png` |
| **2.3** | Select Offered Values Modal | `ValueSelectModal` | Click "Select Values" button on Size row. | `ValueSelectModal` opens showing catalog values (XS, S, M, L, XL); clicking "Select all" checks all values; clicking "Save Values" persists configuration. | `tmp/catalog/products/options-variants/03-size-values-selection-modal.png` |
| **2.4** | Optional & Swatch Option Setup | `ValueSelectModal` (Color axis) | Add Color option axis; open `ValueSelectModal`. | Displays color chips, hex swatches, and labels; select subset (Black, White, Navy); save values. | `tmp/catalog/products/options-variants/04-color-values-selection-modal.png` |
| **2.5** | Fully Configured Options Display | `ProductOptionsDialog` table | Inspect options table with multiple axes. | Displays badges, offered values pill list with count, and Single Value Skip picker set to *"Normal variation (show picker)"*. | `tmp/catalog/products/options-variants/05-product-options-configured.png` |
| **2.6** | Single-Value Picker Skip Toggle | Single-value skip selector | On an option with one choice (e.g. One Size), select single value in skip picker. | Saves `requiredValueId`; shows hint that storefront will bypass the picker. | `tmp/catalog/products/options-variants/05-product-options-configured.png` |
| **2.7** | Axis In-Use Deletion Guard | In-use conflict guard | Attempt to delete an option axis that already has variants generated. | UI intercepts backend `409 CONFLICT` and displays localized destructive banner: *"Cannot remove this option because existing variants are currently using it."* | `tmp/catalog/products/options-variants/resiliency/r02-option-in-use-by-variants-conflict.png` |
| **2.8** | Navigation Transition | Transition to variants | Click **"Manage Variants →"** button in dialog footer. | Options dialog gracefully closes and `ProductVariantsDialog` automatically opens. | `tmp/catalog/products/options-variants/06-variants-dialog-empty.png` |

---

#### Group 3: Product Variants Matrix & Cartesian Generation

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Variants Empty State | `ProductVariantsDialog` | Open variants dialog before generation. | Displays clean empty state: *"No variants generated yet"* with action button **"Generate Variants"** and link **"← Configure Options"**. | `tmp/catalog/products/options-variants/06-variants-dialog-empty.png` |
| **3.2** | Cartesian Generator Modal | `GeneratorModal` | Click **"Generate Variants"** button. | `GeneratorModal` computes Cartesian product (e.g. 5 sizes × 3 colors = 15 combos); displays combination preview chips, SKU prefix input, and combination count warning banner (if >100). | `tmp/catalog/products/options-variants/07-cartesian-generator-modal-selected.png` |
| **3.3** | Bulk Variant Creation | Bulk generation mutation | Enter SKU prefix (e.g. `PROTEE-`), select all combinations, click "Generate". | Backend creates variants in bulk; table populates with variant rows displaying combination chips, SKU codes, active badges, and action buttons. | `tmp/catalog/products/options-variants/08-variants-matrix-generated-table.png` |
| **3.4** | Edit Variant Metadata Modal | `VariantFormModal` | Click "Edit" (`Edit2` icon) on a variant row. | `VariantFormModal` opens; combination badges are permanently locked; fill in GTIN barcode (8–14 digits), weight in grams, dimensions (L × W × H mm), and save. | `tmp/catalog/products/options-variants/09-variant-edit-modal-filled.png` |
| **3.5** | Real-Time Table Metadata Update | `VariantFormModal` save | Submit variant edit modal. | Variant row immediately updates showing new GTIN, formatted weight (e.g. `185g`), and formatted dimensions (`280 × 200 × 15 mm`). | `tmp/catalog/products/options-variants/10-variant-updated-in-table.png` |
| **3.6** | Variant Deletion | Variant row action | Click "Delete variant" icon button on a row. | Variant is removed from database and table; count pill updates. | `tmp/catalog/products/options-variants/11-variant-deleted-row-removed.png` |
| **3.7** | Reciprocal Back-Transition | Back-navigation link | Click **"← Configure Options"** in footer. | Variants dialog closes and Product Options dialog seamlessly reopens with preserved options configuration. | `tmp/catalog/products/options-variants/12-navigated-back-to-options-dialog.png` |
| **3.8** | Duplicate Combination Collision Guard | Cartesian generator / variant creation | Attempt to generate combinations when some already exist, or submit a variant matching an existing combination signature. | Generator filters out existing signatures using pipe delimiter (`'|'`); backend rejects collisions with `VARIANT_COMBO_EXISTS` (409) based on deterministic sorted option-value tuple signature (`${optionTypeId}:${optionValueId}`). | `tmp/catalog/products/options-variants/resiliency/r02-option-in-use-by-variants-conflict.png` |
| **3.9** | Denormalized Combination Name Resolution & Mobile Row-Wise Footer | `ProductVariantsDialog` & `VariantFormModal` | Open variant edit modal or view variants list with archived option types or on mobile viewport (<768px). | Variant selections resolve option type names and value codes directly from backend-denormalized fields and fallback maps (never displaying raw UUID strings); dialog footer buttons arrange row-wise with wrap support rather than stacking into full-width vertical blocks. | `tmp/catalog/products/options-variants/10-variant-updated-in-table.png` |

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

---

#### Group 5: Offers, Multi-Warehouse Stock & Buy-Box Management

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **5.1** | Offers Dialog Overview | `ProductOffersDialog` | Open row menu on product; click "Offers & Stock". | `ProductOffersDialog` opens showing product title, variant tabs with offer counts, Buy-Box winner summary card, and offers table. | `tmp/catalog/products/offers/01-offers-dialog-overview.png` |
| **5.2** | Multi-Offer Variant Competition | Variant tabs & Buy-Box card | Click variant tab with competing offers (e.g. `TEE-BLK-M`). | Dynamic Buy-Box Winner diagnostic card recalculates immediately, displaying winner badge, winning seller (`Shopnetic Retail Inc.`), winning price (`$17.99`), competing seller count (2 sellers), and pricing range (`$17.99 – $19.99`). Table marks Winner vs Competing listings. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.3** | Empty Buy-Box State | Diagnostic card (empty) | Click variant tab with zero offers. | Card gracefully displays empty diagnostic state: *"No Buy-Box Winner — No active in-stock offers are currently competing for this variant."* | `tmp/catalog/products/offers/01-offers-dialog-overview.png` |
| **5.4** | Create Seller Offer Modal | `OfferFormModal` | Click **"Add Offer"** button in dialog header. | `OfferFormModal` opens with seller picker, variant picker, listing price input, promotional sale dates, handling days, order limits, and initial warehouse allocation. | `tmp/catalog/products/offers/03-create-offer-modal.png` |
| **5.5** | Offer Form Minor Unit Calculation | Price formatting & cents math | Fill price (`$18.50`), sale price (`$16.00`), promotional dates, handling days (2), initial stock (25). | Form inputs format cents to dollars in real time; validation prevents negative prices or invalid ranges. | `tmp/catalog/products/offers/03b-create-offer-modal-filled.png` |
| **5.6** | Multi-Warehouse Stock Modal | `StockAdjustModal` | Click "Adjust Stock" (`Boxes` icon) on an offer row. | `StockAdjustModal` opens displaying multi-warehouse allocation for the offer seller, on-hand units, reserved units, safety stock threshold, backorder toggle (`Switch`), and restock ETA picker. | `tmp/catalog/products/offers/04-stock-adjust-modal.png` |
| **5.7** | Register New Warehouse | `WarehouseFormModal` | Click **"New Warehouse"** in dialog header. | `WarehouseFormModal` opens to register a fulfillment depot directly for the seller with address fields, default toggle, and country code validation. | `tmp/catalog/products/offers/05-new-warehouse-modal.png` |
| **5.8** | Soft Delete Offer with Undo Toast | `useSoftDeleteWithUndo` (Offers) | Click "Delete Offer" (`Trash2` icon) on a competing listing. | Offer row is immediately hidden, Buy-Box recalculates, and a localized undo toast with a `TimerBar` progress countdown appears in the viewport. | `tmp/catalog/products/offers/06-offer-soft-delete-undo-toast.png` |
| **5.9** | Restore Offer via Undo | Undo toast action | Click "Undo" on the soft-delete notification toast. | Offer is seamlessly restored to the live table, status badge re-evaluates, and success confirmation is displayed. | `tmp/catalog/products/offers/07-offer-restored-success.png` |
| **5.10** | Deep-Link Direct Mount | Deep-link routing (`useHighlightTarget`) | Navigate to `?target=<productId>&action=offers`. | Deep-link routing automatically opens the Offers modal for the targeted product on initial page mount without user clicks. | `tmp/catalog/products/offers/08-deep-link-offers-open.png` |
| **5.11** | Mobile Responsive Viewport | Responsive modal layout | Emulate mobile viewport (390×844). | Horizontally scrollable variant tabs, responsive header buttons, and stacked metadata adapt cleanly to mobile screens. | `tmp/catalog/products/offers/09-offers-mobile-responsive.png` |
| **5.12** | Promotional Sale Window Expiration | Buy-Box price evaluator | Inspect Buy-Box for an offer where current time is outside active promotional window (`saleStartsAt <= now <= saleEndsAt`). | Algorithm validates promotional dates and falls back to regular listing price (`priceMinor`) outside window; promotional sale badge and strikethrough are omitted. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.13** | Zero-Stock Backorder-Tolerant Winner | Backorder Buy-Box selection | Competing offer has 0 available on-hand stock but allows backorders (`Stock.backorder = true`) at lowest price. | Algorithm qualifies the listing under `totalAvailable > 0 || backorder` (evaluating `o.stocks.some(s => s.backorder)`); offer wins the Buy-Box with a "Backorder Available" badge. | `tmp/catalog/products/offers/02-offers-variant-buybox-competing.png` |
| **5.14** | Offer & Warehouse Stock Optimistic Concurrency Control (OCC) | `OfferFormModal` / `StockAdjustModal` | Submit an offer or warehouse stock level update concurrently with another admin modification. | Both `OfferFormModal` and `StockAdjustModal` supply the `expectedUpdatedAt` ISO timestamp; API intercepts stale edits and triggers `409 CONFLICT` optimistic concurrency error without silent overwrites. | `tmp/catalog/products/offers/03-create-offer-modal.png` & `04-stock-adjust-modal.png` |
| **5.15** | Responsive Stock Modal Header Layout | `StockAdjustModal` | Open stock adjustment modal on mobile viewport (<768px). | Modal header stacks title, description, and head metadata (SKU • condition • Total Available) first, with the "+ Add warehouse" action button positioned below metadata across full width, preventing overlap or squeezed titles. | `tmp/catalog/products/offers/04-stock-adjust-modal.png` |
| **5.16** | Warehouse Auto-Selection & Fallback Placeholder | `OfferFormModal` | Open offer creation modal for seller with warehouses vs without warehouses. | If seller has one warehouse, auto-selects it; if multiple, prompts selection; if zero warehouses, select trigger is disabled showing placeholder *"No warehouses found"* with helper text. | `tmp/catalog/products/offers/ui-offer-warehouse-autoselected.png` & `ui-offer-warehouse-dropdown.png` |

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

---

## Changelog

- 2026-10-15 — Updated UI Tests Specifications (Sections 10, 11, 12, 13, 14) for unified Radix Select architecture across Catalog domain: elevated SelectContent (z-[60]), solid base background with white text on selected item, lighter tint on hover without ticks, removal of synthetic `__none__` dummy items, automatic single-warehouse selection with empty state fallbacks in offer creation, and complete test verification sweep across Brands, Option Types, Value Sets, Categories, and Products.
- 2026-10-15 — Updated Section 10 UI Tests Specification with backend-denormalized variant combination option names and labels (eliminating raw UUID fallbacks), row-wise mobile footer button wrapping in ProductVariantsDialog, responsive StockAdjustModal header layout, concise 1P/3P origin badges, labeled mobile card rows (eliminating ambiguous bullet chains), and capForMessage string truncation across dynamic select dropdowns.
- 2026-10-15 — Updated Section 10 UI Tests Specification with Grouped Popover Filters, Clear filters action, reactive pending review list removal, clean no-op edit save bypass, pre-archive status restoration, text truncation tooltips, single-line tabular prices, small viewport (<1200px) responsive card views, and refreshed dedicated verification screenshots (12-products-filters-popover-open, 13-products-status-filter-reset, 14-products-cell-truncation-and-price, 15-products-archived-reference-names).
- 2026-10-09 — Added Section 15 (Category Hierarchy & Tree Management) UI Tests Specification relocated from plan/11; synchronized Section 10 Buy-Box and variant delimiter invariants; updated Sections 11 (Brands), 12 (Option Types), 13 (Value Sets), and 14 (Category Options) UI Tests Specifications; updated build progress for Inventory & Buy-Box features.
- 2026-08-31 — Initial draft.
