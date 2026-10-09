import { z } from 'zod';
import { currencySchema } from './catalog.js';

export const offerConditionSchema = z.enum([
  'new',
  'refurbished_like_new',
  'refurbished_good',
  'used_like_new',
  'used_good',
  'used_fair',
]);
export type OfferCondition = z.infer<typeof offerConditionSchema>;

export const offerStatusSchema = z.enum([
  'active',
  'paused',
  'out_of_stock',
  'under_review',
  'suppressed',
]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const warehouseAddressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().length(2).toUpperCase(),
});
export type WarehouseAddress = z.infer<typeof warehouseAddressSchema>;

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  name: z.string().min(1).max(100),
  isDefault: z.boolean(),
  address: warehouseAddressSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Warehouse = z.infer<typeof warehouseSchema>;

export const createWarehouseRequestSchema = z.object({
  sellerId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
  address: warehouseAddressSchema,
});
export type CreateWarehouseRequest = z.input<typeof createWarehouseRequestSchema>;

export const stockLevelSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  onHand: z.number().int().min(0),
  reserved: z.number().int().min(0),
  available: z.number().int().min(0),
  safetyStock: z.number().int().min(0),
  backorder: z.boolean(),
  restockEta: z.string().datetime().nullable(),
});
export type StockLevel = z.infer<typeof stockLevelSchema>;

export const offerSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  sellerName: z.string(),
  shopSlug: z.string(),
  variantId: z.string().uuid(),
  skuCode: z.string(),
  priceMinor: z.string().regex(/^\d+$/),
  currency: currencySchema,
  salePriceMinor: z.string().regex(/^\d+$/).nullable(),
  saleStartsAt: z.string().datetime().nullable(),
  saleEndsAt: z.string().datetime().nullable(),
  compareAtMinor: z.string().regex(/^\d+$/).nullable(),
  condition: offerConditionSchema,
  conditionNotes: z.string().nullable(),
  handlingDays: z.number().int().min(0).max(30),
  status: offerStatusSchema,
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).nullable(),
  stocks: z.array(stockLevelSchema),
  totalOnHand: z.number().int().min(0),
  totalAvailable: z.number().int().min(0),
  isBuyboxWinner: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Offer = z.infer<typeof offerSchema>;

export const createOfferRequestSchema = z.object({
  sellerId: z.string().uuid().optional(),
  variantId: z.string().uuid(),
  priceMinor: z.string().regex(/^\d+$/, 'price in minor units must be positive digits'),
  currency: currencySchema,
  salePriceMinor: z.string().regex(/^\d+$/).optional(),
  saleStartsAt: z.string().datetime().optional(),
  saleEndsAt: z.string().datetime().optional(),
  compareAtMinor: z.string().regex(/^\d+$/).optional(),
  condition: offerConditionSchema.default('new'),
  conditionNotes: z.string().trim().max(500).optional(),
  handlingDays: z.number().int().min(0).max(30).default(1),
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).optional(),
  initialStock: z.number().int().min(0).default(0),
  warehouseId: z.string().uuid().optional(),
});
export type CreateOfferRequest = z.input<typeof createOfferRequestSchema>;

export const updateOfferRequestSchema = z.object({
  priceMinor: z.string().regex(/^\d+$/).optional(),
  currency: currencySchema.optional(),
  salePriceMinor: z.string().regex(/^\d+$/).nullable().optional(),
  saleStartsAt: z.string().datetime().nullable().optional(),
  saleEndsAt: z.string().datetime().nullable().optional(),
  compareAtMinor: z.string().regex(/^\d+$/).nullable().optional(),
  condition: offerConditionSchema.optional(),
  conditionNotes: z.string().trim().max(500).nullable().optional(),
  handlingDays: z.number().int().min(0).max(30).optional(),
  status: offerStatusSchema.optional(),
  minQty: z.number().int().min(1).optional(),
  maxQty: z.number().int().min(1).nullable().optional(),
});
export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;

export const updateStockRequestSchema = z.object({
  onHand: z.number().int().min(0),
  safetyStock: z.number().int().min(0).default(0),
  backorder: z.boolean().default(false),
  restockEta: z.string().datetime().nullable().optional(),
});
export type UpdateStockRequest = z.input<typeof updateStockRequestSchema>;

export const buyboxSchema = z.object({
  variantId: z.string().uuid(),
  winningOfferId: z.string().uuid().nullable(),
  winningSellerId: z.string().uuid().nullable(),
  winningSellerName: z.string().nullable(),
  winningPriceMinor: z.string().nullable(),
  winningCurrency: currencySchema.nullable(),
  sellerCount: z.number().int().min(0),
  minPriceMinor: z.string().nullable(),
  maxPriceMinor: z.string().nullable(),
  computedAt: z.string().datetime(),
});
export type Buybox = z.infer<typeof buyboxSchema>;

export const listOffersQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  status: z.enum(['active', 'all']).default('active'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
