# 26 — Catalog: Options, Variants, Stock, Media & Brands

Status: DRAFT
Related: `07-data-model.md`, `11-search-and-catalog.md`, `05-features-seller.md`, `06-features-admin.md`, `25-database-conventions.md`

**Build progress:** built so far — `brand` (+ `brand_alias`, section 6); the global
`option_type` / `option_value` catalog (section 3); `value_set` (+ `value_set_item`,
section 2.1); `category_option` (section 2.1) as an upsert at
`PUT /admin/v1/categories/:categoryId/options/:optionTypeId`; and `product`
(+ `product_option`, `product_option_value`, `variant`, `variant_option_value`,
section 2.2–2.3) — admin CRUD at `/admin/v1/products`, `…/:id/options/:optionTypeId`
(+ `/values`), `…/:id/variants`. Admin CRUD also at `/admin/v1/brands`,
`/admin/v1/option-types`, `/admin/v1/value-sets`. `data_type` ships as
`select|text|number|bool|swatch` (`select` in place of this doc's `enum`).
Variant selections are immutable and cover exactly the `is_variant_axis` product
options; `combo_signature` blocks duplicate combinations. **`media_asset` +
`media_option_tag` (section 5)** are built for `product` owners — `/admin/v1/products/
:productId/media`, `/admin/v1/media/:id` (+ `…/tags/:optionTypeId`), one tag per
axis per asset, `pending` status = not shown.
**Deferred:** `offer` / `stock` / `warehouse` / `buybox` (Inventory context) and
`offer`-owned media — need `seller_id`; `brand_request` (section 6); moderation queue,
per-category media rules (min/max, aspect ratio) and render-time gallery
resolution (section 5).
Next once the seller context exists: `offer` → `stock` → `buybox`.

This is the hardest modeling problem in the platform. Reference screenshots:
`tmp/amazon_shirt_options.png` (Color + Size + pack qty), `tmp/amazon_iphone_options.png`
(Storage + Color + Carrier + Grade, with unavailable combos), `tmp/amazon_headphone_options.png`
(single Color + "see other options", 9 videos), `tmp/amazon_search.png` (facets),
`tmp/amazon_categories.png` (category tree).

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
value_set              (id, name)                              -- e.g. "Apparel sizes"
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
  need extra verification (`16` section 6).
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
  invent a *new option type* for a shared product; they can propose it to admin
  for the category.
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
- `open` color values: free text + normalization dictionary vs a curated
  master palette sellers map onto (leaning: curated master palette + alias, so
  facets stay clean).
- Whether sellers can ever create a brand directly once "trusted" (fast-track),
  or always via request (leaning: always request, faster SLA for trusted).

## Changelog

- 2026-08-31 — Initial draft.
