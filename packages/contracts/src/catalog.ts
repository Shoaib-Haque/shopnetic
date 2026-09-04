import { z } from 'zod';

/**
 * Catalog contracts. User-facing names are **localized fields** (`24` §5):
 * `{ "en": "Phones" }` — the default locale (`en`) is required.
 */
export const localizedTextSchema = z
  .record(z.string().min(2).max(12), z.string().trim().min(1).max(200))
  .refine((v) => typeof v['en'] === 'string' && v['en'].length > 0, {
    message: 'a value for the default locale ("en") is required',
  });
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens only');

export const categoryBrandRequirementSchema = z.enum(['required', 'optional', 'none']);
export type CategoryBrandRequirement = z.infer<typeof categoryBrandRequirementSchema>;

export const createCategoryRequestSchema = z.object({
  slug: slugSchema,
  name: localizedTextSchema,
  parentId: z.string().uuid().nullish(),
  position: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  brandRequirement: categoryBrandRequirementSchema.optional(),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

/** Everything except the parent — reparenting is `POST …/:id/move`. */
export const updateCategoryRequestSchema = z
  .object({
    slug: slugSchema,
    name: localizedTextSchema,
    position: z.number().int().min(0).max(100_000),
    isActive: z.boolean(),
    brandRequirement: categoryBrandRequirementSchema,
  })
  .partial();
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const moveCategoryRequestSchema = z.object({
  parentId: z.string().uuid().nullable(),
  position: z.number().int().min(0).max(100_000).optional(),
});
export type MoveCategoryRequest = z.infer<typeof moveCategoryRequestSchema>;

export const categorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  slug: z.string(),
  name: localizedTextSchema,
  /** Materialized ltree path of id segments (root→self). Depth = segment count. */
  path: z.string(),
  depth: z.number().int().positive(),
  position: z.number().int(),
  isActive: z.boolean(),
  brandRequirement: categoryBrandRequirementSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

// ── Brands ───────────────────────────────────────────────────────────────────

export const brandStatusSchema = z.enum(['pending', 'active', 'rejected']);
export type BrandStatus = z.infer<typeof brandStatusSchema>;

const brandNameSchema = z.string().trim().min(1).max(120);

export const brandAliasSchema = z.object({
  id: z.string(),
  alias: z.string(),
  createdAt: z.string(),
});
export type BrandAlias = z.infer<typeof brandAliasSchema>;

export const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  displayName: localizedTextSchema.nullable(),
  logoKey: z.string().nullable(),
  status: brandStatusSchema,
  mergedIntoBrandId: z.string().nullable(),
  aliases: z.array(brandAliasSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Brand = z.infer<typeof brandSchema>;

export const createBrandRequestSchema = z.object({
  name: brandNameSchema,
  slug: slugSchema.optional(),
  displayName: localizedTextSchema.optional(),
  status: brandStatusSchema.optional(),
  aliases: z.array(brandNameSchema).max(50).optional(),
});
export type CreateBrandRequest = z.infer<typeof createBrandRequestSchema>;

export const updateBrandRequestSchema = z
  .object({
    name: brandNameSchema,
    slug: slugSchema,
    displayName: localizedTextSchema.nullable(),
    logoKey: z.string().max(500).nullable(),
    status: brandStatusSchema,
  })
  .partial();
export type UpdateBrandRequest = z.infer<typeof updateBrandRequestSchema>;

export const addBrandAliasRequestSchema = z.object({ alias: brandNameSchema });
export type AddBrandAliasRequest = z.infer<typeof addBrandAliasRequestSchema>;

export const mergeBrandRequestSchema = z.object({ intoBrandId: z.string().uuid() });
export type MergeBrandRequest = z.infer<typeof mergeBrandRequestSchema>;

// ── Option types & values (plan/26 §1, §3) ───────────────────────────────────

/** `select` = fixed value list; `swatch` = same, with a colour/image chip. */
export const optionDataTypeSchema = z.enum(['select', 'text', 'number', 'bool', 'swatch']);
export type OptionDataType = z.infer<typeof optionDataTypeSchema>;

export const optionStatusSchema = z.enum(['active', 'deprecated']);
export type OptionStatus = z.infer<typeof optionStatusSchema>;

/** Latin slug for matching/URLs: lowercase, digits, single `-`/`_` between. */
const optionCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'lowercase letters, digits and single - or _ only');

const swatchHexSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb hex colour')
  .transform((v) => v.toLowerCase());

export const optionValueSchema = z.object({
  id: z.string(),
  optionTypeId: z.string(),
  code: z.string(),
  label: localizedTextSchema,
  swatchHex: z.string().nullable(),
  swatchImageKey: z.string().nullable(),
  position: z.number().int(),
  status: optionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OptionValue = z.infer<typeof optionValueSchema>;

export const optionTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: localizedTextSchema,
  dataType: optionDataTypeSchema,
  hasSwatch: z.boolean(),
  status: optionStatusSchema,
  values: z.array(optionValueSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OptionType = z.infer<typeof optionTypeSchema>;

const optionValueInputSchema = z.object({
  code: optionCodeSchema,
  label: localizedTextSchema,
  swatchHex: swatchHexSchema.nullish(),
  swatchImageKey: z.string().max(500).nullish(),
  position: z.number().int().min(0).max(100_000).optional(),
});

export const createOptionTypeRequestSchema = z.object({
  code: optionCodeSchema,
  name: localizedTextSchema,
  dataType: optionDataTypeSchema.optional(),
  hasSwatch: z.boolean().optional(),
  values: z.array(optionValueInputSchema).max(500).optional(),
});
export type CreateOptionTypeRequest = z.infer<typeof createOptionTypeRequestSchema>;

export const updateOptionTypeRequestSchema = z
  .object({
    code: optionCodeSchema,
    name: localizedTextSchema,
    dataType: optionDataTypeSchema,
    hasSwatch: z.boolean(),
    status: optionStatusSchema,
  })
  .partial();
export type UpdateOptionTypeRequest = z.infer<typeof updateOptionTypeRequestSchema>;

export const addOptionValueRequestSchema = optionValueInputSchema;
export type AddOptionValueRequest = z.infer<typeof addOptionValueRequestSchema>;

export const updateOptionValueRequestSchema = z
  .object({
    code: optionCodeSchema,
    label: localizedTextSchema,
    swatchHex: swatchHexSchema.nullable(),
    swatchImageKey: z.string().max(500).nullable(),
    position: z.number().int().min(0).max(100_000),
    status: optionStatusSchema,
  })
  .partial();
export type UpdateOptionValueRequest = z.infer<typeof updateOptionValueRequestSchema>;

// ── Value sets (managed value lists — plan/26 §2.1) ──────────────────────────

const valueSetNameSchema = z.string().trim().min(1).max(120);
const positionField = z.number().int().min(0).max(100_000);

export const valueSetItemSchema = z.object({
  optionValueId: z.string(),
  optionTypeId: z.string(),
  code: z.string(),
  label: localizedTextSchema,
  position: z.number().int(),
});
export type ValueSetItem = z.infer<typeof valueSetItemSchema>;

export const valueSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(valueSetItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ValueSet = z.infer<typeof valueSetSchema>;

const valueSetItemInputSchema = z.object({
  optionValueId: z.string().uuid(),
  position: positionField.optional(),
});

export const createValueSetRequestSchema = z.object({
  name: valueSetNameSchema,
  items: z.array(valueSetItemInputSchema).max(1000).optional(),
});
export type CreateValueSetRequest = z.infer<typeof createValueSetRequestSchema>;

export const updateValueSetRequestSchema = z.object({ name: valueSetNameSchema });
export type UpdateValueSetRequest = z.infer<typeof updateValueSetRequestSchema>;

export const addValueSetItemRequestSchema = valueSetItemInputSchema;
export type AddValueSetItemRequest = z.infer<typeof addValueSetItemRequestSchema>;

// ── Category options (per-category option config — plan/26 §2.1) ─────────────

export const optionApplicabilitySchema = z.enum(['required', 'optional', 'not_applicable']);
export type OptionApplicability = z.infer<typeof optionApplicabilitySchema>;

export const valueSourceSchema = z.enum(['predefined', 'open', 'hybrid']);
export type ValueSource = z.infer<typeof valueSourceSchema>;

export const categoryOptionSchema = z.object({
  categoryId: z.string(),
  optionTypeId: z.string(),
  /** The option type's `code`, denormalised for display. */
  optionTypeCode: z.string(),
  applicability: optionApplicabilitySchema,
  isVariantAxis: z.boolean(),
  valueSource: valueSourceSchema,
  valueSetId: z.string().nullable(),
  priceImpact: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CategoryOption = z.infer<typeof categoryOptionSchema>;

/**
 * Upsert body for `PUT …/categories/:categoryId/options/:optionTypeId`. All
 * fields optional; on first write the model defaults apply (`optional`,
 * `is_variant_axis = true`, `value_source = open`, no set, no price impact).
 * A non-`open` source requires `valueSetId`; `open` forbids it (server-checked).
 */
export const putCategoryOptionRequestSchema = z.object({
  applicability: optionApplicabilitySchema.optional(),
  isVariantAxis: z.boolean().optional(),
  valueSource: valueSourceSchema.optional(),
  valueSetId: z.string().uuid().nullable().optional(),
  priceImpact: z.boolean().optional(),
  position: positionField.optional(),
});
export type PutCategoryOptionRequest = z.infer<typeof putCategoryOptionRequestSchema>;

// ── Products (plan/26 §1–2) ─────────────────────────────────────────────────

export const productStatusSchema = z.enum(['draft', 'pending', 'active', 'archived']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'a 3-letter ISO-4217 code');

/** Non-negative integer minor units (cents). Carried as a string in views. */
const priceMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const specSchema = z.record(z.string(), z.unknown());

export const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  brandId: z.string().nullable(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  slug: z.string(),
  status: productStatusSchema,
  basePriceMinor: z.string().nullable(),
  currency: z.string().nullable(),
  spec: specSchema,
  proposedBySellerId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductRequestSchema = z.object({
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullish(),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  slug: slugSchema,
  status: productStatusSchema.optional(),
  basePriceMinor: priceMinorSchema.nullish(),
  currency: currencySchema.nullish(),
  spec: specSchema.optional(),
  proposedBySellerId: z.string().uuid().nullish(),
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

/** Category is fixed after creation (it scopes the option config). */
export const updateProductRequestSchema = z
  .object({
    brandId: z.string().uuid().nullable(),
    title: localizedTextSchema,
    description: localizedTextSchema.nullable(),
    slug: slugSchema,
    status: productStatusSchema,
    basePriceMinor: priceMinorSchema.nullable(),
    currency: currencySchema.nullable(),
    spec: specSchema,
  })
  .partial();
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

// ── Product options (plan/26 §2.2) ─────────────────────────────────────────

export const productOptionValueRefSchema = z.object({
  optionValueId: z.string(),
  code: z.string(),
  position: z.number().int(),
});

export const productOptionSchema = z.object({
  productId: z.string(),
  optionTypeId: z.string(),
  optionTypeCode: z.string(),
  position: z.number().int(),
  requiredValueId: z.string().nullable(),
  values: z.array(productOptionValueRefSchema),
});
export type ProductOption = z.infer<typeof productOptionSchema>;

export const putProductOptionRequestSchema = z.object({
  position: positionField.optional(),
  requiredValueId: z.string().uuid().nullable().optional(),
});
export type PutProductOptionRequest = z.infer<typeof putProductOptionRequestSchema>;

/** Replaces the full set of values this product offers on the axis. */
export const setProductOptionValuesRequestSchema = z.object({
  values: z
    .array(z.object({ optionValueId: z.string().uuid(), position: positionField.optional() }))
    .max(500),
});
export type SetProductOptionValuesRequest = z.infer<typeof setProductOptionValuesRequestSchema>;

// ── Variants (plan/26 §2.3) ────────────────────────────────────────────────

export const variantStatusSchema = z.enum(['active', 'inactive']);
export type VariantStatus = z.infer<typeof variantStatusSchema>;

export const variantSelectionSchema = z.object({
  optionTypeId: z.string(),
  optionValueId: z.string(),
});
export type VariantSelection = z.infer<typeof variantSelectionSchema>;

const dimsSchema = z.record(z.string(), z.unknown());

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  skuCode: z.string().nullable(),
  gtin: z.string().nullable(),
  weightG: z.number().int().nullable(),
  dims: dimsSchema.nullable(),
  comboSignature: z.string(),
  status: variantStatusSchema,
  position: z.number().int(),
  selections: z.array(variantSelectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Variant = z.infer<typeof variantSchema>;

export const createVariantRequestSchema = z.object({
  skuCode: z.string().trim().min(1).max(64).nullish(),
  gtin: z
    .string()
    .trim()
    .regex(/^[0-9]{8,14}$/, '8–14 digits')
    .nullish(),
  weightG: z.number().int().min(0).max(10_000_000).nullish(),
  dims: dimsSchema.nullish(),
  status: variantStatusSchema.optional(),
  position: positionField.optional(),
  selections: z
    .array(
      variantSelectionSchema.extend({
        optionTypeId: z.string().uuid(),
        optionValueId: z.string().uuid(),
      }),
    )
    .max(20),
});
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;

/** The combination is immutable — change it by deleting and recreating. */
export const updateVariantRequestSchema = z
  .object({
    skuCode: z.string().trim().min(1).max(64).nullable(),
    gtin: z
      .string()
      .trim()
      .regex(/^[0-9]{8,14}$/, '8–14 digits')
      .nullable(),
    weightG: z.number().int().min(0).max(10_000_000).nullable(),
    dims: dimsSchema.nullable(),
    status: variantStatusSchema,
    position: positionField,
  })
  .partial();
export type UpdateVariantRequest = z.infer<typeof updateVariantRequestSchema>;

// ── Media assets (plan/26 §5) ──────────────────────────────────────────────

export const mediaKindSchema = z.enum(['image', 'video']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const mediaOwnerTypeSchema = z.enum(['product', 'offer']);
export type MediaOwnerType = z.infer<typeof mediaOwnerTypeSchema>;

/** `pending` = awaiting moderation (not shown); `active` = shown; `rejected`. */
export const mediaStatusSchema = z.enum(['pending', 'active', 'rejected']);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const mediaOptionTagSchema = z.object({
  optionTypeId: z.string(),
  optionTypeCode: z.string(),
  optionValueId: z.string(),
  code: z.string(),
});
export type MediaOptionTag = z.infer<typeof mediaOptionTagSchema>;

export const mediaAssetSchema = z.object({
  id: z.string(),
  ownerType: mediaOwnerTypeSchema,
  ownerId: z.string(),
  kind: mediaKindSchema,
  fileKey: z.string(),
  posterKey: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationS: z.number().int().nullable(),
  blurhash: z.string().nullable(),
  alt: localizedTextSchema.nullable(),
  position: z.number().int(),
  status: mediaStatusSchema,
  tags: z.array(mediaOptionTagSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

const objectKeySchema = z.string().trim().min(1).max(1024);
const pixelSchema = z.number().int().min(1).max(100_000);

export const createMediaRequestSchema = z.object({
  kind: mediaKindSchema,
  fileKey: objectKeySchema,
  posterKey: objectKeySchema.nullish(),
  width: pixelSchema.nullish(),
  height: pixelSchema.nullish(),
  durationS: z.number().int().min(0).max(86_400).nullish(),
  blurhash: z.string().trim().max(128).nullish(),
  alt: localizedTextSchema.optional(),
  position: positionField.optional(),
  status: mediaStatusSchema.optional(),
});
export type CreateMediaRequest = z.infer<typeof createMediaRequestSchema>;

export const updateMediaRequestSchema = z
  .object({
    fileKey: objectKeySchema,
    posterKey: objectKeySchema.nullable(),
    width: pixelSchema.nullable(),
    height: pixelSchema.nullable(),
    durationS: z.number().int().min(0).max(86_400).nullable(),
    blurhash: z.string().trim().max(128).nullable(),
    alt: localizedTextSchema.nullable(),
    position: positionField,
    status: mediaStatusSchema,
  })
  .partial();
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;

/** Upsert a tag on one axis: `PUT …/media/:id/tags/:optionTypeId`. */
export const putMediaTagRequestSchema = z.object({ optionValueId: z.string().uuid() });
export type PutMediaTagRequest = z.infer<typeof putMediaTagRequestSchema>;
