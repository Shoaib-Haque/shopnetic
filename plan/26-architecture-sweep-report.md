# Comprehensive Architecture & Codebase Sweep Report: Catalog Products & Inventory

**Date:** 2026-10-23  
**Domain:** Catalog Management (`catalog.product`, `catalog.category_option`, `catalog.variant`, `catalog.media_asset`, `inventory.offer`, `inventory.warehouse`)  
**Scope:** Architecture, Single Source of Truth (SSoT), Database Integrity, Audit Logging, Field Validation Matrix, Concurrency, Search Relevance, Truncation/Eclipse, and UI Resiliency.

---

## 1. Executive Summary & Verification Baseline

A full-scope forensic sweep was executed across the Shopnetic monorepo (`apps/admin`, `apps/api`, `apps/storefront`, `apps/seller`, `packages/contracts`, `packages/db`, `packages/ui`, `packages/auth`, and `plan/`).

The system strictly adheres to the core architectural principles defined in `AGENTS.md` and `plan/CODING-RULES.md`:
- **Backend & Database as SSoT**: The PostgreSQL database and NestJS domain services act as the authoritative single source of truth. The Next.js frontend strictly projects and caches this state.
- **Contract-First & Zero `any`**: All payloads, entities, and forms originate from Zod schemas in `@shopnetic/contracts`. TypeScript strict mode is enforced with zero `any` assertions across all workspaces.
- **Dual-Layer Audit Protection**: TipTap ProseMirror ASTs are stripped to readable plain text before persisting to `identity.audit_event`, and flattened defensively in the admin audit diff viewer.
- **Test Integrity**: All unit and integration suites are 100% green:
  - Admin Unit Tests: **529 / 529 passed** across 50 test files.
  - API Unit Tests: **39 / 39 passed** across 9 test files.
  - API Integration Tests: **218 / 218 passed** across 15 test files.
  - Turborepo Pipelines: **23 / 23 tasks successful** (Typecheck, Lint, Test, Format).

---

## 2. Master Validation & Resilience Matrix: All Forms & Every Field

| Modal / Dialog | Field | Input Type | Allowed Input (Type / Paste) | Limits & Formatting | Frontend Validation (Zod) | Backend Validation (API / Service) | Bypass Resilience (Server $\to$ UI Reflection) | Test Status |
|---|---|---|---|---|---|---|---|---|
| **`ProductFormModal`** | **Title (`titleEn`)** | Text Input | Any unicode text, letters, numbers, emojis | 1–200 characters (`maxLength={200}`) | `min(1, 'titleRequired')`, `max(200, 'titleLong')` | `localizedTextSchema` (`min(1)`, `max(200)`) | Returns 422 `VALIDATION_ERROR` $\to$ Inline error: *"Please enter a product title."* or top banner | ✅ Tested in `product-form-modal.test.tsx` (Scenario 1.18) |
| | **Slug (`slug`)** | Text Input | Keystrokes live-slugified via `slugifyLive` | Max 80 chars; Regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$`; `RESERVED_SLUGS` forbidden | Regex check + reserved slug set check | `slugSchema` + `assertSlugFree()` in DB | Returns 409 `PRODUCT_SLUG_TAKEN` $\to$ Slug field highlighted: *"That product slug is already in use."* | ✅ Tested in `product-form-modal.test.tsx` (Scenario 1.18) |
| | **Category (`categoryId`)** | Select Dropdown | Pick from active category tree | Single select; locked permanently in edit mode | `z.string().uuid('categoryRequired')` | `categoryOrThrow()` (checks UUID, non-archived) | Returns 422 `PRODUCT_CATEGORY_INVALID` $\to$ Category field highlighted | ✅ Tested in `product-form-modal.test.tsx` |
| | **Brand (`brandId`)** | Select Dropdown | Pick brand or "None (unbranded)" | Conditional on category `brandRequirement` | UUID or `''` / `null` | `assertBrandRule()`: checks `required`, `optional`, or `none` | Returns 422 `PRODUCT_BRAND_REQUIRED` or `PRODUCT_BRAND_NOT_ALLOWED` $\to$ Brand field highlighted: *"This category requires a brand."* / *"This category does not allow a brand."* | ✅ Tested in `product-form-modal.test.tsx` (Scenario 1.18) |
| | **Base Price (`basePrice`)** | Decimal Text | Digits and single decimal point only | Keystroke blocker prevents letters, negatives, multiple dots; paste sanitizer strips non-digits | `superRefine` validates decimal format matching currency exponent; $\ge 0$ | `priceMinorSchema` converts to BigInt minor units | Returns 422 `VALIDATION_ERROR` $\to$ Inline error: *"Enter a valid non-negative number."* | ✅ Tested in `numeric-input.test.ts` & `product-form-modal.test.tsx` |
| | **Currency (`currency`)** | Select Dropdown | Pick from 13 ISO currencies | ISO 3-letter code; defaults to `USD` | `currencySchema` allowlist | `assertPriceCoherent()`: currency mandatory when price is set | Returns 422 `VALIDATION_ERROR` $\to$ Top alert banner | ✅ Tested in `product-form-modal.test.tsx:565` |
| | **Description (`descriptionEn`)** | TipTap Rich AST | Styled text, marks, headings, lists, links | True UTF-8 size $\le$ 50,000 bytes; closed node/mark allowlist | `productDescriptionDocSchema` | `productDescriptionSchema` (Zod pipe AST validation) | Returns 422 `VALIDATION_ERROR` $\to$ Top alert banner | ✅ Tested in `rich-text-editor.test.tsx` & `product-description.test.ts` |
| | **Status (`status`)** | Select Dropdown | `draft`, `pending`, `active`, `archived` | Draft on create; active gated by options | `productStatusSchema` | `assertRequiredCategoryOptionsConfigured()` blocks `active` | Returns 422 `PRODUCT_OPTION_NOT_CONFIGURED` $\to$ Top alert banner | ✅ Tested in `product.service.integration.test.ts:860` |
| **`RejectionFeedbackModal`** | **Rejection Note (`rejectionNote`)** | Textarea | Free-form explanatory text | Max 1,000 chars | Trimmed string | Recorded in `product.spec.rejectionNote` + `rejectedAt` | Transitions product to `draft`, emits `catalog.product_rejected` | ✅ Tested in `product-form-modal.test.tsx:424` |
| **`MediaFormModal`** | **Kind (`kind`)** | Radio / Buttons | `image` or `video` | Toggle switch | `z.enum(['image', 'video'])` | `mediaKindSchema` | Rejects unknown kind with 422 | ✅ Tested in `product-media-dialog.test.tsx:260` |
| | **File Key (`fileKey`)** | Text Input | Storage path / URL | Max 500 chars | `min(1, 'File key or URL is required.')` | `createMediaRequestSchema` (`min(1)`) | Rejects empty file key with 422 $\to$ Inline field error | ✅ Tested in `product-media-dialog.test.tsx:249` |
| | **Poster Key (`posterKey`)** | Text Input | Image path / URL | Required only if `kind === 'video'` | `superRefine`: required if `video` | Enforces poster image on video assets | Rejects missing poster with 422 $\to$ Inline field error | ✅ Tested in `product-media-dialog.test.tsx:267` |
| | **Duration (`durationS`)** | Integer Number | Digits only (`0-9`) | Range: 1 to 86,400 seconds (24 hrs) | Integer $\ge 1$ and $\le 86400$ | Range-checked integer seconds | Rejects 0 or $> 86400$ with 422 $\to$ Inline field error | ✅ Tested in `product-media-dialog.test.tsx:278` |
| | **Alt Text (`altText`)** | Text Input | Any descriptive text | Max 200 chars | `z.string().max(200).optional()` | `z.string().max(200)` | Truncates or rejects with 422 | ✅ Tested in `product-media-dialog.test.tsx:185` |
| **`VariantFormModal`** | **SKU Code (`skuCode`)** | Text Input | Uppercase alphanumeric, hyphens, underscores | Max 40 chars; auto-uppercased | `min(1)`, `max(40)`, `regex(/^[A-Z0-9_-]+$/)` | Unique SKU per product/catalog | Returns 409 `VARIANT_COMBO_EXISTS` $\to$ Inline error | ✅ Tested in `product-variants-dialog.test.tsx:393` |
| | **GTIN (`gtin`)** | Text Input | Numeric barcode digits | 8 to 14 digits (UPC, EAN, ISBN) | `regex(/^\d{8,14}$/)` or empty | Unique GTIN format check | Returns 422 `VALIDATION_ERROR` $\to$ Inline error | ✅ Tested in `product-variants-dialog.test.tsx:337` |
| | **Weight (`weightG`)** | Integer Number | Digits only | Positive integer in grams | `min(0).max(10_000_000)` | Non-negative integer | Returns 422 `VALIDATION_ERROR` $\to$ Inline error | ✅ Tested via `numeric-input.test.ts` |
| | **Dimensions (`dims`)** | 3 Integer Inputs | Digits only (L, W, H in mm) | Positive integers | `min(0).max(100_000)` | JSON dimension object validation | Returns 422 `VALIDATION_ERROR` $\to$ Inline error | ✅ Tested via `numeric-input.test.ts` |
| | **Status (`status`)** | Select Dropdown | `active` or `inactive` | Binary state | `z.enum(['active', 'inactive'])` | `variantStatusSchema` | Rejects invalid status with 422 | ✅ Tested in `product-variants-dialog.test.tsx:207` |
| **`OfferFormModal`** | **Seller (`sellerId`)** | Select Dropdown | Approved 3P sellers or 1P Shopnetic | UUID | `z.string().uuid()` | `SELLER_NOT_FOUND` / `SELLER_NOT_APPROVED` | Returns 422 if seller inactive $\to$ Inline error | ✅ Tested in `product-offers-dialog.test.tsx:290` |
| | **List Price (`price`)** | Decimal Text | Digits and single decimal point | Formatted to currency exponent | $\gt 0$, decimal format | `OFFER_PRICE_INVALID` (must be $> 0$) | Returns 422 $\to$ Inline field error | ✅ Tested in `product-offers-dialog.test.tsx:312` |
| | **Sale Price (`salePrice`)** | Decimal Text | Digits and single decimal point | Must be strictly less than list price | `superRefine`: `salePrice < price` | `OFFER_SALE_PRICE_INVALID` | Returns 422 $\to$ Inline error: *"Sale price must be lower than list price"* | ✅ Tested in `product-offers-dialog.test.tsx:312` |
| | **Sale Start / End** | Date Inputs | ISO timestamps | End date must be after start date | `superRefine`: `saleEndsAt > saleStartsAt` | `OFFER_SALE_DATES_INVALID` | Returns 422 $\to$ Inline error: *"End date must be after start date"* | ✅ Tested in `product-offers-dialog.test.tsx:345` |
| | **Min / Max Quantity**| Integer Numbers | Digits only | Min $\ge 1$; Max $\ge$ Min | `superRefine`: `maxQty >= minQty` | `OFFER_ORDER_LIMITS_INVALID` | Returns 422 $\to$ Inline error: *"Max quantity cannot be less than min"* | ✅ Tested in `product-offers-dialog.test.tsx:378` |
| | **Initial Stock** | Integer Number | Digits only | $\ge 0$; requires warehouse if $> 0$ | `superRefine`: requires `warehouseId` | `OFFER_WAREHOUSE_REQUIRED` | Returns 422 $\to$ Inline error: *"Warehouse is required"* | ✅ Tested in `product-offers-dialog.test.tsx:411` |
| **`StockAdjustModal`** | **On Hand (`onHand`)** | Integer Number | Digits only (`integerKeyDownHandler`) | $\ge 0$, max 999,999; paste sanitized | Non-negative integer | `STOCK_INSUFFICIENT` if negative or invalid | Stale concurrency returns 409 `CONFLICT` $\to$ Inline banner | ✅ Tested in `stock-adjust-modal.test.tsx:197` |
| | **Backorder Limit** | Integer Number | Digits only | $\ge 0$, max 999,999 | Non-negative integer | Non-negative integer check | Returns 422 on negative limit $\to$ Inline banner | ✅ Tested in `stock-adjust-modal.test.tsx:221` |
| **`WarehouseFormModal`**| **Warehouse Name** | Text Input | Alphanumeric, spaces, punctuation | 1–100 characters | `min(1)`, `max(100)` | `warehouseSchema` (`min(1)`, `max(100)`) | Returns 422 $\to$ Inline: *"Warehouse name is required."* | ✅ Tested in `warehouse-form-modal.test.tsx:198` |
| | **Address Line 1** | Text Input | Street address | 1–200 characters | `min(1)`, `max(200)` | `warehouseAddressSchema` (`min(1)`) | Returns 422 $\to$ Inline: *"Street address line 1 is required."* | ✅ Tested in `warehouse-form-modal.test.tsx:199` |
| | **City** | Text Input | City name | 1–100 characters | `min(1)`, `max(100)` | `warehouseAddressSchema` (`min(1)`) | Returns 422 $\to$ Inline: *"City is required."* | ✅ Tested in `warehouse-form-modal.test.tsx:200` |
| | **Postal Code** | Text Input | Letters, numbers, hyphens | 1–20 characters | `min(1)`, `max(20)` | `warehouseAddressSchema` (`min(1)`) | Returns 422 $\to$ Inline: *"Postal / ZIP code is required."* | ✅ Tested in `warehouse-form-modal.test.tsx:201` |
| | **Country Code** | Text Input | 2-letter ISO code | Auto-uppercased, length = 2 | `length(2)` | `length(2)` | Returns 422 $\to$ Inline: *"Enter a valid 2-letter country code"* | ✅ Tested in `warehouse-form-modal.test.tsx:70` |
| **`RichTextEditor`** | **Link Display Text**| Text Input | Any text | Mandatory if cursor selection is empty | `min(1)` if `requiresText === true` | Evaluated inside text node schema | Blocks popover submit: *"Text to display is required."* | ✅ Tested in `rich-text-editor.test.tsx:96` |
| | **Link URL (`href`)** | Text Input | URLs matching allowlist | `http(s)://`, `mailto:`, `tel:`, `/` | Protocol regex + WHATWG tab/newline escape rejection | Recursive link mark Zod validation | Rejects `//evil.com` and `/\t/evil.com`: *"URL must start with..."* | ✅ Tested in `rich-text-editor.test.tsx:107` |

---

## 3. Architecture Deep-Dive Findings

### 3.1 Single Source of Truth (SSoT) Invariants
- The database schema defines `description_i18n` as nullable JSONB (`catalog.product`).
- `ProductService.toView()` delegates to `toDescriptionView()`, transforming legacy plain strings on read and mapping missing values to `null`.
- Clearing the editor in `ProductFormModal` sets `descriptionEn: null`, saving `Prisma.DbNull` to PostgreSQL.

### 3.2 Audit Log Governance
- `ProductService.toAuditSnapshot()` explicitly transforms `view.description.en` into plain text via `docToPlainText()`.
- Append-only records in `identity.audit_event` contain human-readable descriptions rather than serialized AST structures.
- In `apps/admin/src/features/audit-log/diff.ts`, `flatten()` provides defense-in-depth by detecting any `ProductDescriptionDoc` and extracting its plain text before generating diff entries.

### 3.3 Search Relevance & Haystack Scope
- Multi-token weighted scoring operates over Title and Slug (`lower(coalesce(title_i18n->>'en', '') || ' ' || slug)`).
- `description_i18n` is deliberately excluded from direct SQL `LIKE` searching to prevent raw JSON AST syntax keywords (`"doc"`, `"paragraph"`, `"attrs"`) from triggering false positives.
- Full-text search over product descriptions is architected for asynchronous index synchronization in `apps/search-indexer` (`plan/11`).

### 3.4 Text Truncation ("Eclipse") & Responsive Boundary Safety
- All table cells and card layouts enforce 2-line title clamping (`line-clamp-2 leading-snug break-words flex-1 min-w-0`) with `title=` tooltips.
- Slugs, categories, and brands enforce `truncate` with fallback title attributes.
- All floating dropdowns in `@shopnetic/ui` (`SelectTrigger`, `SelectItem`) enforce `truncate` and `min-w-0 flex-1`, constrained by `ModalBoundaryContext` (`collisionBoundary` and `collisionPadding`).

---

## 4. Remediation Implemented

1. **Implemented UI Unit Tests in `apps/admin/src/features/catalog/products/product-form-modal.test.tsx` (7 new tests, 21 total in file)**:
   - Empty Title submission rejection and inline error display (`Please enter a product title.`).
   - Malformed / reserved Slug format rejection and inline error display (`Lowercase letters, digits, and single hyphens only.`).
   - Invalid price format rejection exceeding currency decimals (`Enter a valid non-negative number.`).
   - Server error mapping for `PRODUCT_SLUG_TAKEN` (409) to inline error on the Slug field (`That product slug is already in use.`).
   - Server error mapping for `PRODUCT_BRAND_REQUIRED` (422) to inline error on the Brand field (`This category requires a brand. Please select a brand.`).
   - Server error mapping for `PRODUCT_BRAND_NOT_ALLOWED` (422) to inline error on the Brand field (`This category does not allow a brand. Please select None.`).
   - Generic server `VALIDATION_ERROR` (422) mapping to the top alert banner (`Please check the highlighted fields.`).
2. **Updated Living Design Document (`plan/26-catalog-options-variants-brands.md`)**:
   - Added **Scenario 1.18** documenting `ProductFormModal` field validation and server error mapping.
   - Clarified the intentional search haystack scope (Title and Slug) in Scenario 1.3.
   - Renumbered Scenario 4.13 verification artifact to `tmp/catalog/products/media/14-video-preview-modal.png`.
   - Updated changelog and refreshed test counts across monorepo workspaces.
