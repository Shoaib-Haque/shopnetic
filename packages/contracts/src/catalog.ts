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
