/**
 * Demo inventory & sellers — believable, edge-case-free 1P & 3P sellers,
 * warehouses, offers, stock levels, and buyboxes for catalog variants.
 */
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import { recomputeBuyboxes, upsertOffer, upsertSeller, upsertWarehouse } from '../factories.js';

export async function seedDemoInventory(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  // ── 1. Sellers ────────────────────────────────────────────────────────────
  // 1P In-house retail
  await upsertSeller(prisma, ctx, {
    accountEmail: 'admin@shopnetic.test',
    legalName: 'Shopnetic Retail Inc.',
    type: 'business',
    country: 'US',
    status: 'approved',
    shop: {
      slug: 'shopnetic-retail',
      displayName: 'Shopnetic Retail',
      description: 'Official direct marketplace store of Shopnetic.',
    },
  });

  // 3P Marketplace seller
  await upsertSeller(prisma, ctx, {
    accountEmail: 'seller@shopnetic.test',
    legalName: 'Apex Goods LLC',
    type: 'business',
    country: 'US',
    status: 'approved',
    shop: {
      slug: 'apex-sellers',
      displayName: 'Apex Sellers',
      description: 'Premier merchant for consumer goods and apparel.',
    },
  });

  // ── 2. Warehouses ─────────────────────────────────────────────────────────
  await upsertWarehouse(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    name: 'Shopnetic Central FC (Austin)',
    isDefault: true,
    address: {
      line1: '100 Fulfillment Way',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
  });

  await upsertWarehouse(prisma, ctx, {
    sellerSlug: 'apex-sellers',
    name: 'Apex West Coast Hub (LA)',
    isDefault: true,
    address: {
      line1: '500 Logistics Blvd',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
    },
  });

  // ── 3. Offers & Stock ─────────────────────────────────────────────────────
  // Classic Cotton Tee (TEE-BLK-S, TEE-BLK-M, TEE-WHT-M, TEE-BLU-L)
  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'TEE-BLK-S',
    priceMinor: 1999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 100,
  });

  // TEE-BLK-M has competing offers: Shopnetic Retail @ $19.99 vs Apex Sellers @ $17.99 (Apex wins buybox!)
  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'TEE-BLK-M',
    priceMinor: 1999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 150,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'apex-sellers',
    sku: 'TEE-BLK-M',
    priceMinor: 1799,
    salePriceMinor: 1699,
    currency: 'USD',
    warehouseName: 'Apex West Coast Hub (LA)',
    onHand: 40,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'TEE-WHT-M',
    priceMinor: 1999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 80,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'TEE-BLU-L',
    priceMinor: 2199,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 60,
  });

  // Galaxy S Flagship (GS-128-BLK, GS-256-BLK, GS-256-WHT)
  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'GS-128-BLK',
    priceMinor: 79999,
    salePriceMinor: 74999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 25,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'GS-256-BLK',
    priceMinor: 89999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 15,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'GS-256-WHT',
    priceMinor: 89999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 10,
  });

  // QuietComfort Headphones (QC-BLK, QC-WHT)
  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'QC-BLK',
    priceMinor: 34999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 50,
  });

  await upsertOffer(prisma, ctx, {
    sellerSlug: 'shopnetic-retail',
    sku: 'QC-WHT',
    priceMinor: 34999,
    currency: 'USD',
    warehouseName: 'Shopnetic Central FC (Austin)',
    onHand: 35,
  });

  // ── 4. Buybox calculation for all seeded variants ──────────────────────────
  await recomputeBuyboxes(prisma, ctx);

  log.info(
    { sellers: ctx.seller.size, warehouses: ctx.warehouse.size },
    'demo inventory & offers seeded',
  );
}
