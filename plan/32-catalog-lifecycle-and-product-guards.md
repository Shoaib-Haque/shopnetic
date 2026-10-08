# 32 — Catalog Lifecycle, Product Guards & Corner Cases

Status: DECIDED (2026-10-08)
Related: `07-data-model.md`, `12-cart-checkout-orders.md`, `22-risks-and-open-questions.md`, `25-database-conventions.md`, `26-catalog-options-variants-brands.md`, `29-cart-and-listing-change-alerts.md`

## 1. Problem & Scope

A multi-vendor e-commerce marketplace exhibits complex lifecycle dependencies across taxonomy nodes (Category), attribution (Brand), variant specifications (Option Type, Option Value, Value Set, Category Option), master catalog entities (Product, Variant), merchant offers (Seller Listing), and buyer baskets (Cart, Wishlist, Order).

Without strict lifecycle rules and perimeter guards:
- Archiving a Category leaves products orphaned with broken breadcrumbs, invalid search facets, and undefined tax classification.
- Archiving a Brand leaves products unbranded, violating category brand requirements or creating broken storefront links.
- Mutating variant axes collapses multi-dimensional variant combinations, causing SKU collisions.
- Changing catalog attributes after checkout could silently alter historical financial and fulfillment records.

This document formalizes the universal lifecycle invariants, resolve deferred policy decisions (Q31, Q32), defines the complete 360-degree actor/system state matrix, and specifies the programmatic guards required across the platform.

---

## 2. Core Architectural Invariants

### 1. The Order Invariant (Immutable Order-Line Snapshot)
- When a buyer places an order, Step 3 of the checkout saga (`12-cart-checkout-orders.md`) captures an **immutable `order_line` snapshot** containing:
  - Product title, description snippet, and thumbnail media key
  - SKU code and selected variant combination (e.g. `{"Color": "Navy", "Size": "XL"}`)
  - Unit price (minor currency units) and currency code
  - Tax amount and platform commission accrual rate
  - Seller account ID and fulfillment SLA
- **Immobility Guarantee**: No subsequent mutation to Category, Brand, Option Type, Product status, or Seller account ever alters historical orders. Fulfilled, in-transit, delivered, and refunded orders are 100% immune to catalog changes.

### 2. Reactivity Boundary
- Catalog mutations react strictly across **pre-order surfaces**:
  - Admin catalog authoring & moderation
  - Seller portal inventory & listing management
  - Buyer browse, search, and Product Detail Page (PDP)
  - Buyer active Cart & Wishlist (`29-cart-and-listing-change-alerts.md`)
  - Checkout pre-flight session revalidation (`12-cart-checkout-orders.md` Step 1)

### 3. Guard-Before-Archive Doctrine (`07`, `25`)
- Deletion in the catalog domain is soft deletion (`deleted_at: DateTime?`).
- **Prisma Caveat**: PostgreSQL foreign keys with `ON DELETE RESTRICT` only fire on physical SQL `DELETE`. Because the platform soft-deletes via `UPDATE SET deleted_at = NOW()`, **all relational integrity guards MUST be executed programmatically in service business logic**.
- Archiving is blocked whenever a live dependent entity would be orphaned (`409 Conflict`), providing structured error codes and remediation guidance.

### 4. Separation of Catalog Item vs Seller Offer
- In Shopnetic's Amazon-style architecture (`ADR-0003`):
  - **Master Catalog (`Product`, `Variant`)**: Defines global specification, attributes, and media. Managed by Admins or proposed by Sellers via moderation.
  - **Seller Offer (`Offer`)**: Represents an individual merchant's price, stock, handling time, and condition attached to a Variant.
  - Archiving a Product or Variant disables all attached Seller Offers.

---

## 3. Resolution of Open Policy Decisions

### Q32: Category Archival with Live Products
- **Decision**: **STRICTLY BLOCKED** (`CATEGORY_HAS_PRODUCTS`, 409).
- **Rule**: `category.service.remove()` queries `prisma.product.count({ where: { categoryId: id, deletedAt: null } })`. If `count > 0`, the operation is rejected with `CATEGORY_HAS_PRODUCTS` (409) and detail message: *"Cannot archive category while N product(s) reference it; re-categorize or archive the products first."*
- **Rationale**: Products without a category break URL structures, faceted search filters, tax codes, and breadcrumbs. Archival requires deliberate re-categorization or archival of dependent products.

### Q31: Brand Restriction Enforcement Mechanism
- **Decision**: **GATE AT SUBMISSION / MODERATION (`pending_review`)**.
- **Rule**: When `brand.is_restricted = true`, creating or submitting a product under that brand does not crash or block the form. Instead, the product is routed to catalog moderation with status `pending_review`.
- **Seller Flow**: The seller must submit brand authorization proof / invoices before the product is published.
- **Existing Products**: Existing approved products under the brand remain active unless specifically revoked via a moderation sweep.

### Brand Archival Guard (Q31/Q32 Sibling)
- **Decision**: **STRICTLY BLOCKED** (`BRAND_HAS_PRODUCTS`, 409).
- **Rule**: `brand.service.remove()` queries `prisma.product.count({ where: { brandId: id, deletedAt: null } })`. If `count > 0`, the operation is rejected with `BRAND_HAS_PRODUCTS` (409) and detail message: *"Cannot archive brand while N product(s) reference it; use the merge tool or reassign the products first."*
- **Escape Hatch**: The admin must use the **Brand Merge Tool** (`26` Section 6) to consolidate products into an active brand, or reassign products.

### Restore Safety (Reverse Lifecycle)
- **Category Restore**: Blocked if parent category is archived (`CATEGORY_PARENT_ARCHIVED`, 409) or if name/slug collides with a live category.
- **Brand Restore**: Blocked if the brand was merged into another brand (`BRAND_MERGE_INVALID`, 422) or if name/slug collides with a live brand.
- **Product Restore**: Blocked if parent Category is currently archived (`CATEGORY_PARENT_ARCHIVED`, 409).
- **Variant Restore**: Blocked if parent Product is archived, or if combination signature (`comboSignature`) collides with a live variant.

### Product Re-Categorization Lock
- An existing product may be moved to a new category only if:
  1. The target category's brand requirement (`none`, `optional`, `required`) is satisfied.
  2. The target category's configured variant axes (`is_variant_axis: true`) match or can be reconciled with the product's existing variant matrix. If mismatched, re-categorization is blocked until variants are reconciled.

---

## 4. Master 360-Degree Corner-Case Matrix

| # | Event / Condition | Admin Portal | Seller Portal | Buyer Browse / PDP | Active Cart / Wishlist (`29`) | Checkout & Orders (`12`) |
|---|---|---|---|---|---|---|
| **1** | **Category Archived** (has live products) | **BLOCKED (Q32)**: `CATEGORY_HAS_PRODUCTS` (409). | N/A (Guarded). | N/A (Guarded). | N/A (Guarded). | **100% immune.** Past orders unaffected. |
| **2** | **Category Archived** (0 live products) | Soft-delete succeeds. Excluded from live views. | Category drops from seller product creation picker. | Category listing 404/410. | N/A. | **100% immune.** |
| **3** | **Category Restored** | Blocked if parent archived (`CATEGORY_PARENT_ARCHIVED`). | Re-appears in seller pickers. | Category page active again. | N/A. | N/A. |
| **4** | **Category Moved / Reparented** | Path rewritten in DB transaction. | Breadcrumb path updates in inventory. | Facets & breadcrumbs update dynamically. | Unchanged (same product & price). | **100% immune.** |
| **5** | **Category Brand Rule Changed** (e.g. `optional` → `required`) | New products must select brand. Edit form enforces on save. | Existing live products stay active. Edit form requires brand before saving. | Unchanged. Active products render as-is. | Unchanged. | **100% immune.** |
| **6** | **Category Option Added** (New required attribute) | New products must supply attribute. | Existing products stay live; flagged as "Incomplete specs". | Displayed if present, omitted if legacy. | Unchanged. | **100% immune.** |
| **7** | **Product Re-categorized** | Blocked if target category variant axes mismatch existing variants. | Seller must reconcile variant axes before moving. | Breadcrumbs update to new category immediately. | Unchanged. | **100% immune.** |
| **8** | **Brand Archived** (has live products) | **BLOCKED**: `BRAND_HAS_PRODUCTS` (409). Error directs to Brand Merge. | N/A (Guarded). | N/A (Guarded). | N/A (Guarded). | **100% immune.** |
| **9** | **Brand Merged** (Brand B → Brand A) | Brand B soft-deleted. Aliases moved to Brand A. | `product.brandId` updated to Brand A via background job. Seller notified. | Search reindexes under Brand A. Brand B URL 301/410 redirects to Brand A. | Low-severity `info` alert: *"Brand updated to Brand A"*. | **100% immune.** Frozen receipt displays purchased brand. |
| **10** | **Brand Restricted** (`is_restricted = true`) (Q31) | Adding/editing allowed; status holds at `pending_review`. | Seller listing gated: must upload authorization/invoices. | Unapproved items hidden. Approved items visible. | Existing active cart items unchanged. | **100% immune.** |
| **11** | **Option Type Deprecated** | Hidden from new Product Option pickers. | Existing variants remain valid and sellable. Cannot create new variants with it. | Swatch/chip renders normally on PDP. Buyable. | Orderable until inventory runs out. | **100% immune.** |
| **12** | **Option Value Deprecated** | Hidden from new variant creation pickers. | Existing variants keep value. Cannot create new variants with it. | Swatch/chip renders normally on PDP. Buyable. | Orderable until inventory runs out. | **100% immune.** |
| **13** | **Option Value Renamed** | Displays updated label across admin pickers. | Displays updated label in inventory table. | PDP dynamically displays new label/swatch. | `info` alert: `option_changed` (*"Color updated"*). Non-blocking. | **100% immune.** Receipt shows frozen snapshot. |
| **14** | **Option Value Pruned from Value Set** | Dropped from category pickers for new products. | Existing variants remain sellable. Cannot create new variants with it. | Existing variant buyable on PDP. | Orderable until inventory runs out. | **100% immune.** |
| **15** | **Category-Option Axis Demoted** | Cannot add axis to new products. | **BLOCKED**: `CATEGORY_OPTION_IN_USE` (409) if variants exist. | N/A (Guarded). | N/A (Guarded). | **100% immune.** |
| **16** | **Product Archived by Platform** | Product soft-deleted. All variants deactivated. | All seller offers on product disabled. Notification sent. | PDP returns 404 or "Discontinued". Dropped from search. | `blocking` alert: `product_removed`. Moved to Unavailable group. | Step 1 saga revalidation aborts checkout before charge. |
| **17** | **Product Restored** | Blocked if category is archived or brand deleted. | Seller offers restored to `draft` (require seller re-activation). | PDP goes live once active seller offer exists. | If in saved list, alerts: *"Back in stock"*. | Normal checkout resumes. |
| **18** | **Variant Deactivated** | Variant status sets to `inactive`. | Inventory for this SKU zeroed/disabled. | Swatch struck through / disabled on PDP. | `action_required` alert: `variant_gone`. Must pick another variant. | Checkout blocks unacknowledged line. |
| **19** | **Multi-Seller Stockout (Failover)** | Aggregated stock reflects surviving offers. | Seller 1 offer paused. Seller 2 becomes Buy Box winner. | PDP Buy Box flips to Seller 2. | If buyer had Seller 1: Alert offers 1-click switch to Seller 2. | Seamless if buyer accepts switch. |
| **20** | **Seller Suspended** | Seller locked out of catalog editing. | Seller portal enters **Fulfillment Only** mode. Must ship pending orders. | Seller offers removed from Buy Box. If no other seller, PDP "Unavailable". | `blocking` alert: `seller_suspended`. Offers alternative seller if available. | **Saga blocks new orders.** Seller fulfills existing placed orders. |
| **21** | **Item Exchange on Discontinued Variant** | Returns dashboard notes variant is archived. | Seller cannot fulfill replacement SKU. | N/A. | N/A. | **Returns engine blocks exchange**, issues monetary refund instead. |
| **22** | **Concurrent Archival & Checkout Race** | Admin archives product while buyer clicks "Place Order". | Offer reservation released automatically. | PDP unavailable upon refresh. | Saga Step 1 revalidates DB state; halts before charge; localized error shown. | **Zero orphan orders.** Payment never captured. |

---

## 5. Technical Implementation & Verification Plan

### 1. Error Codes (`packages/contracts/src/error-codes.ts`)
- Add `CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS'`
- Add `BRAND_HAS_PRODUCTS: 'BRAND_HAS_PRODUCTS'`

### 2. Service-Level Guards (`apps/api/src/catalog/`)
- **`CategoryService.remove(id)`**:
  ```ts
  const products = await this.prisma.product.count({ where: { categoryId: id, deletedAt: null } });
  if (products > 0) {
    throw new AppError('CATEGORY_HAS_PRODUCTS', 409, {
      detail: `cannot archive category while ${products} product(s) reference it; re-categorize or archive the products first`,
    });
  }
  ```
- **`BrandService.remove(id)`**:
  ```ts
  const products = await this.prisma.product.count({ where: { brandId: id, deletedAt: null } });
  if (products > 0) {
    throw new AppError('BRAND_HAS_PRODUCTS', 409, {
      detail: `cannot archive brand while ${products} product(s) reference it; use the merge tool or reassign the products first`,
    });
  }
  ```
- **`BrandService.restore(id)`**:
  ```ts
  if (current.mergedIntoBrandId) {
    throw new AppError('BRAND_MERGE_INVALID', 422, {
      detail: 'cannot restore a brand that was merged into another brand',
    });
  }
  ```
- **`ProductService.restore(id)`**:
  ```ts
  const category = await this.prisma.category.findUnique({ where: { id: current.categoryId } });
  if (!category || category.deletedAt) {
    throw new AppError('CATEGORY_PARENT_ARCHIVED', 409, {
      detail: 'cannot restore product because its category is archived; restore the category first',
    });
  }
  ```

### 3. Integration Tests
- Verify `CategoryService.remove()` throws `CATEGORY_HAS_PRODUCTS` when live products exist.
- Verify `BrandService.remove()` throws `BRAND_HAS_PRODUCTS` when live products exist.
- Verify `BrandService.restore()` throws `BRAND_MERGE_INVALID` when brand was merged.
