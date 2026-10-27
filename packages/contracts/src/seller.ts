import { z } from 'zod';
import { slugSchema } from './catalog.js';

export const sellerTypeSchema = z.enum(['individual', 'business']);
export type SellerType = z.infer<typeof sellerTypeSchema>;

export const sellerStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'suspended',
  'offboarding',
  'closed',
]);
export type SellerStatus = z.infer<typeof sellerStatusSchema>;

export const VALID_SELLER_STATUS_TRANSITIONS: Record<SellerStatus, readonly SellerStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft', 'closed'],
  approved: ['suspended', 'offboarding'],
  suspended: ['approved', 'offboarding'],
  offboarding: ['closed'],
  closed: [],
} as const;

export const REASON_REQUIRED_SELLER_STATUSES: readonly SellerStatus[] = [
  'draft',
  'suspended',
  'offboarding',
  'closed',
] as const;

export const sellerSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountEmail: z.string().email().nullable().optional(),
  legalName: z.string().min(1).max(255),
  type: sellerTypeSchema,
  country: z.string().length(2).toUpperCase(),
  status: sellerStatusSchema,
  lastReviewNote: z.string().nullable().optional(),
  commissionOverrideBps: z.number().int().min(0).max(10000).nullable(),
  reserveBps: z.number().int().min(0).max(10000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Seller = z.infer<typeof sellerSchema>;

export const shopSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  slug: slugSchema,
  displayName: z.string().min(1).max(100),
  description: z.string().max(2000).nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  vacationUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Shop = z.infer<typeof shopSchema>;

export const sellerWithShopSchema = sellerSchema.extend({
  shop: shopSchema.nullable(),
});
export type SellerWithShop = z.infer<typeof sellerWithShopSchema>;

export const createSellerRequestSchema = z.object({
  legalName: z.string().trim().min(2).max(255),
  type: sellerTypeSchema.default('business'),
  country: z.string().trim().length(2).toUpperCase(),
  shop: z.object({
    slug: slugSchema,
    displayName: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).optional(),
    logoUrl: z.string().url().optional(),
    bannerUrl: z.string().url().optional(),
  }),
});
export type CreateSellerRequest = z.infer<typeof createSellerRequestSchema>;

export const updateSellerStatusRequestSchema = z
  .object({
    status: sellerStatusSchema,
    reason: z.string().trim().max(500).optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (REASON_REQUIRED_SELLER_STATUSES as readonly string[]).includes(data.status) &&
      (!data.reason || data.reason.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason of at least 5 characters is required for this status change',
      });
    }
  });
export type UpdateSellerStatusRequest = z.infer<typeof updateSellerStatusRequestSchema>;

export const checkShopSlugResponseSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
});
export type CheckShopSlugResponse = z.infer<typeof checkShopSlugResponseSchema>;

export const updateMyShopRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  vacationUntil: z.string().datetime().nullable().optional(),
  expectedUpdatedAt: z.string().optional(),
});
export type UpdateMyShopRequest = z.infer<typeof updateMyShopRequestSchema>;
