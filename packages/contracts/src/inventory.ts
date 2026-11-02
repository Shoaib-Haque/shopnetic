import { z } from 'zod';
import { currencySchema } from './catalog.js';

export const OFFER_PRICE_MAX_MINOR = 99_999_900n; // $999,999.00
export const OFFER_QTY_MAX = 999_999;
export const STOCK_UNITS_MAX = 999_999;
export const WAREHOUSE_NAME_MAX = 100;
export const WAREHOUSE_LINE1_MAX = 200;
export const WAREHOUSE_LINE2_MAX = 200;
export const WAREHOUSE_CITY_MAX = 100;
export const WAREHOUSE_STATE_MAX = 100;
export const WAREHOUSE_POSTAL_MAX = 20;

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
  line1: z.string().trim().min(1).max(WAREHOUSE_LINE1_MAX),
  line2: z.string().trim().max(WAREHOUSE_LINE2_MAX).optional(),
  city: z.string().trim().min(1).max(WAREHOUSE_CITY_MAX),
  state: z.string().trim().max(WAREHOUSE_STATE_MAX).optional(),
  postalCode: z.string().trim().min(1).max(WAREHOUSE_POSTAL_MAX),
  country: z.string().trim().length(2).toUpperCase(),
});
export type WarehouseAddress = z.infer<typeof warehouseAddressSchema>;

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  name: z.string().min(1).max(WAREHOUSE_NAME_MAX),
  isDefault: z.boolean(),
  address: warehouseAddressSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Warehouse = z.infer<typeof warehouseSchema>;

export const createWarehouseRequestSchema = z.object({
  sellerId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(WAREHOUSE_NAME_MAX),
  isDefault: z.boolean().default(false),
  address: warehouseAddressSchema,
});
export type CreateWarehouseRequest = z.input<typeof createWarehouseRequestSchema>;

export const updateWarehouseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(WAREHOUSE_NAME_MAX),
    isDefault: z.boolean(),
    address: warehouseAddressSchema,
    expectedUpdatedAt: z.string().optional(),
  })
  .partial();
export type UpdateWarehouseRequest = z.infer<typeof updateWarehouseRequestSchema>;

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
  updatedAt: z.string().datetime().optional(),
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

/**
 * Validates whether a date string has a 4-digit year format (1970–2100)
 * and represents a valid chronological date.
 */
export function isValidDateYearRange(val?: string | null): boolean {
  if (!val) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(val);
  if (!match) return false;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() === year || d.getFullYear() === year;
}

/**
 * Validates that a date is not in the past (using consistent UTC day boundary comparison).
 * Returns true if the target date is strictly before today (00:00:00 UTC).
 */
export function isDateInPastUtc(val: string | Date): boolean {
  const d = typeof val === 'string' ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return targetUtc < todayUtc;
}

export const isoDateTimeSchema = z
  .string()
  .datetime()
  .refine((val) => isValidDateYearRange(val), { message: 'year must be between 1970 and 2100' });

export const restockEtaSchema = z
  .string()
  .datetime()
  .refine((val) => isValidDateYearRange(val) && !isDateInPastUtc(val), {
    message: 'restock ETA date cannot be in the past',
  });

export const createOfferRequestSchema = z.object({
  sellerId: z.string().uuid().optional(),
  variantId: z.string().uuid(),
  priceMinor: z
    .string()
    .regex(/^\d+$/, 'price in minor units must be positive digits')
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'price exceeds maximum allowed value',
    }),
  currency: currencySchema,
  salePriceMinor: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'sale price exceeds maximum allowed value',
    })
    .optional(),
  saleStartsAt: isoDateTimeSchema.optional(),
  saleEndsAt: isoDateTimeSchema.optional(),
  compareAtMinor: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'compare at price exceeds maximum allowed value',
    })
    .optional(),
  condition: offerConditionSchema.default('new'),
  conditionNotes: z.string().trim().max(500).optional(),
  handlingDays: z.number().int().min(0).max(30).default(1),
  minQty: z.number().int().min(1).max(OFFER_QTY_MAX).default(1),
  maxQty: z.number().int().min(1).max(OFFER_QTY_MAX).optional(),
  initialStock: z.number().int().min(0).max(STOCK_UNITS_MAX).default(0),
  warehouseId: z.string().uuid().optional(),
});
export type CreateOfferRequest = z.input<typeof createOfferRequestSchema>;

export const updateOfferRequestSchema = z.object({
  priceMinor: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'price exceeds maximum allowed value',
    })
    .optional(),
  currency: currencySchema.optional(),
  salePriceMinor: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'sale price exceeds maximum allowed value',
    })
    .nullable()
    .optional(),
  saleStartsAt: isoDateTimeSchema.nullable().optional(),
  saleEndsAt: isoDateTimeSchema.nullable().optional(),
  compareAtMinor: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) <= OFFER_PRICE_MAX_MINOR, {
      message: 'compare at price exceeds maximum allowed value',
    })
    .nullable()
    .optional(),
  condition: offerConditionSchema.optional(),
  conditionNotes: z.string().trim().max(500).nullable().optional(),
  handlingDays: z.number().int().min(0).max(30).optional(),
  status: offerStatusSchema.optional(),
  minQty: z.number().int().min(1).max(OFFER_QTY_MAX).optional(),
  maxQty: z.number().int().min(1).max(OFFER_QTY_MAX).nullable().optional(),
  expectedUpdatedAt: z.string().optional(),
});
export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;

export const updateStockRequestSchema = z
  .object({
    onHand: z.number().int().min(0).max(STOCK_UNITS_MAX).optional(),
    delta: z.number().int().optional(),
    safetyStock: z.number().int().min(0).max(STOCK_UNITS_MAX).default(0),
    backorder: z.boolean().default(false),
    restockEta: restockEtaSchema.nullable().optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .refine((data) => data.onHand !== undefined || data.delta !== undefined, {
    message: 'either onHand or delta must be provided',
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
  productId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  status: z.enum(['active', 'all']).default('active'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
