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

export const sellerSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  legalName: z.string().min(1).max(255),
  type: sellerTypeSchema,
  country: z.string().length(2).toUpperCase(),
  status: sellerStatusSchema,
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

export const updateSellerStatusRequestSchema = z.object({
  status: sellerStatusSchema,
  reason: z.string().trim().max(500).optional(),
});
export type UpdateSellerStatusRequest = z.infer<typeof updateSellerStatusRequestSchema>;
