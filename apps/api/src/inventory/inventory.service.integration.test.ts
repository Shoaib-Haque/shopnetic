import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import { Permission, type Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SellerService } from '../seller/seller.service.js';
import { WarehouseService } from './warehouse.service.js';
import { BuyboxService } from './buybox.service.js';
import { StockService } from './stock.service.js';
import { OfferService } from './offer.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('Inventory, Offers, Stock & Buybox (integration)', () => {
  let prisma: PrismaClient;
  let sellerService: SellerService;
  let warehouseService: WarehouseService;
  let buyboxService: BuyboxService;
  let stockService: StockService;
  let offerService: OfferService;

  let staffActor: Actor;
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = (x: string): string => `itest-inv-${stamp}-${x}`;

  let testSeller1Id: string;
  let testSeller2Id: string;
  let testVariantId: string;
  let warehouse1Id: string;
  let warehouse2Id: string;
  let offer1Id: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);

    sellerService = new SellerService(pr, audit);
    buyboxService = new BuyboxService(pr);
    warehouseService = new WarehouseService(pr, audit);
    stockService = new StockService(pr, audit, buyboxService);
    offerService = new OfferService(pr, audit, buyboxService);

    const staffAccount = await prisma.account.create({
      data: {
        email: `${s('staff')}@shopnetic.test`,
        plane: 'staff',
        status: 'active',
      },
    });
    staffActor = {
      accountId: staffAccount.id,
      plane: 'staff',
      grants: [
        {
          role: 'ADMIN',
          scopeType: 'global',
          scopeId: null,
          permissions: [
            Permission.OFFER_MANAGE,
            Permission.INVENTORY_MANAGE,
            Permission.SELLER_APPROVE,
          ],
        },
      ],
    };

    // 1. Create 2 test sellers
    const sellerAccount1 = await prisma.account.create({
      data: {
        email: `${s('seller1')}@shopnetic.test`,
        plane: 'marketplace',
        status: 'active',
      },
    });
    const seller1Actor: Actor = {
      accountId: sellerAccount1.id,
      plane: 'marketplace',
      grants: [],
    };
    const s1 = await sellerService.create(
      {
        legalName: 'Test Seller Alpha LLC',
        type: 'business',
        country: 'US',
        shop: {
          slug: s('alpha-shop'),
          displayName: 'Alpha Store',
        },
      },
      seller1Actor,
      {},
    );
    testSeller1Id = s1.id;

    const sellerAccount2 = await prisma.account.create({
      data: {
        email: `${s('seller2')}@shopnetic.test`,
        plane: 'marketplace',
        status: 'active',
      },
    });
    const seller2Actor: Actor = {
      accountId: sellerAccount2.id,
      plane: 'marketplace',
      grants: [],
    };
    const s2 = await sellerService.create(
      {
        legalName: 'Test Seller Beta LLC',
        type: 'business',
        country: 'US',
        shop: {
          slug: s('beta-shop'),
          displayName: 'Beta Store',
        },
      },
      seller2Actor,
      {},
    );
    testSeller2Id = s2.id;

    // 2. Create a test category and product with variant
    const cat = await prisma.category.create({
      data: {
        slug: s('inv-cat'),
        nameI18n: { en: s('Inventory Test Cat') },
        brandRequirement: 'none',
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
      cat.id.replace(/-/g, ''),
      cat.id,
    );

    const product = await prisma.product.create({
      data: {
        slug: s('inv-product'),
        categoryId: cat.id,
        titleI18n: { en: s('Test Inventory Item') },
        status: 'active',
      },
    });

    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        skuCode: s('SKU-INV-1'),
        comboSignature: '',
        status: 'active',
      },
    });
    testVariantId = variant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const testProducts = await prisma.product.findMany({
        where: { slug: { startsWith: `itest-inv-${stamp}-` } },
        select: { id: true },
      });
      const prodIds = testProducts.map((p) => p.id);

      const testVariants = await prisma.variant.findMany({
        where: {
          OR: [{ productId: { in: prodIds } }, { skuCode: { startsWith: `itest-inv-${stamp}-` } }],
        },
        select: { id: true },
      });
      const varIds = testVariants.map((v) => v.id);

      const testAccounts = await prisma.account.findMany({
        where: { email: { startsWith: `itest-inv-${stamp}-` } },
        select: { id: true },
      });
      const accountIds = testAccounts.map((a) => a.id);

      const testSellers = await prisma.seller.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true },
      });
      const sellerIds = testSellers.map((s) => s.id);

      const testWarehouses = await prisma.warehouse.findMany({
        where: { sellerId: { in: sellerIds } },
        select: { id: true },
      });
      const warehouseIds = testWarehouses.map((w) => w.id);

      if (warehouseIds.length > 0 || sellerIds.length > 0 || varIds.length > 0) {
        await prisma.stock.deleteMany({
          where: {
            OR: [
              { warehouseId: { in: warehouseIds } },
              { offer: { sellerId: { in: sellerIds } } },
              { offer: { variantId: { in: varIds } } },
            ],
          },
        });
      }

      if (sellerIds.length > 0 || varIds.length > 0) {
        await prisma.offer.deleteMany({
          where: {
            OR: [{ sellerId: { in: sellerIds } }, { variantId: { in: varIds } }],
          },
        });
      }

      if (warehouseIds.length > 0) {
        await prisma.warehouse.deleteMany({
          where: { id: { in: warehouseIds } },
        });
      }

      if (prodIds.length > 0) {
        await prisma.variant.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
      }

      await prisma.$executeRawUnsafe(
        `DELETE FROM catalog.category WHERE slug LIKE $1`,
        `itest-inv-${stamp}-%`,
      );

      if (sellerIds.length > 0) {
        await prisma.shop.deleteMany({ where: { sellerId: { in: sellerIds } } });
        await prisma.seller.deleteMany({ where: { id: { in: sellerIds } } });
      }

      if (accountIds.length > 0) {
        await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: accountIds } } });
        await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('Warehouse management', () => {
    it('creates default and secondary warehouses for seller', async () => {
      const wh1 = await warehouseService.create(
        testSeller1Id,
        {
          name: 'Primary Austin Warehouse',
          isDefault: true,
          address: {
            line1: '100 Main St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
        },
        staffActor,
        {},
      );
      warehouse1Id = wh1.id;
      expect(wh1.isDefault).toBe(true);
      expect(wh1.sellerId).toBe(testSeller1Id);

      const wh2 = await warehouseService.create(
        testSeller1Id,
        {
          name: 'Dallas Distribution Hub',
          isDefault: false,
          address: {
            line1: '200 Commerce St',
            city: 'Dallas',
            state: 'TX',
            postalCode: '75201',
            country: 'US',
          },
        },
        staffActor,
        {},
      );
      warehouse2Id = wh2.id;
      expect(wh2.isDefault).toBe(false);

      const whSeller2 = await warehouseService.create(
        testSeller2Id,
        {
          name: 'Beta Houston Depot',
          isDefault: true,
          address: {
            line1: '500 Space Center Blvd',
            city: 'Houston',
            state: 'TX',
            postalCode: '77058',
            country: 'US',
          },
        },
        staffActor,
        {},
      );

      const listSeller1 = await warehouseService.list(testSeller1Id);
      expect(listSeller1.length).toBeGreaterThanOrEqual(2);
      expect(listSeller1[0]?.id).toBe(wh1.id); // default first
      expect(listSeller1.some((w) => w.id === warehouse2Id)).toBe(true);
      expect(listSeller1.some((w) => w.id === whSeller2.id)).toBe(false); // strictly isolated from seller2

      const listSeller2 = await warehouseService.list(testSeller2Id);
      expect(listSeller2.some((w) => w.id === whSeller2.id)).toBe(true);
      expect(listSeller2.some((w) => w.id === wh1.id)).toBe(false); // strictly isolated from seller1
      expect(listSeller2.some((w) => w.id === warehouse2Id)).toBe(false);

      const allList = await warehouseService.list();
      expect(allList.length).toBeGreaterThanOrEqual(listSeller1.length + listSeller2.length);
      expect(allList.some((w) => w.id === wh1.id)).toBe(true);
      expect(allList.some((w) => w.id === warehouse2Id)).toBe(true);
      expect(allList.some((w) => w.id === whSeller2.id)).toBe(true);
    });
  });

  describe('Offer creation & validation', () => {
    it('rejects offer if price <= 0', async () => {
      await expect(
        offerService.create(
          testSeller1Id,
          {
            variantId: testVariantId,
            priceMinor: '0',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_PRICE_INVALID' });
    });

    it('rejects offer for non-existent variant', async () => {
      await expect(
        offerService.create(
          testSeller1Id,
          {
            variantId: '00000000-0000-0000-0000-000000000000',
            priceMinor: '1999',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_VARIANT_INVALID' });
    });

    it('creates offer with initial stock and calculates buybox', async () => {
      const offer1 = await offerService.create(
        testSeller1Id,
        {
          variantId: testVariantId,
          priceMinor: '2500', // $25.00
          currency: 'USD',
          warehouseId: warehouse1Id,
          initialStock: 10,
        },
        staffActor,
        {},
      );
      offer1Id = offer1.id;

      expect(offer1.sellerId).toBe(testSeller1Id);
      expect(offer1.priceMinor).toBe('2500');
      expect(offer1.totalOnHand).toBe(10);
      expect(offer1.totalAvailable).toBe(10);
      expect(offer1.isBuyboxWinner).toBe(true);

      const buybox = await buyboxService.get(testVariantId);
      expect(buybox).not.toBeNull();
      expect(buybox?.winningOfferId).toBe(offer1.id);
      expect(buybox?.winningSellerId).toBe(testSeller1Id);
      expect(buybox?.winningPriceMinor).toBe('2500');
      expect(buybox?.sellerCount).toBe(1);
    });

    it('rejects duplicate active offer for same seller and variant', async () => {
      await expect(
        offerService.create(
          testSeller1Id,
          {
            variantId: testVariantId,
            priceMinor: '2400',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_ALREADY_EXISTS' });
    });

    it('rejects offer if salePriceMinor >= priceMinor', async () => {
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            salePriceMinor: '2500',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_SALE_PRICE_INVALID' });
    });

    it('rejects offer if saleEndsAt <= saleStartsAt', async () => {
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            currency: 'USD',
            saleStartsAt: '2026-12-01T00:00:00.000Z',
            saleEndsAt: '2026-11-01T00:00:00.000Z',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_SALE_DATES_INVALID' });
    });

    it('rejects offer if maxQty < minQty', async () => {
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            currency: 'USD',
            minQty: 5,
            maxQty: 2,
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_ORDER_LIMITS_INVALID' });
    });

    it('rejects offer if initialStock > 0 and warehouseId is missing', async () => {
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            currency: 'USD',
            initialStock: 10,
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_WAREHOUSE_REQUIRED' });
    });

    it('rejects offer if warehouseId belongs to a different seller', async () => {
      // warehouse1 belongs to seller 1, attempting to create offer for seller 2 using warehouse1
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            currency: 'USD',
            initialStock: 10,
            warehouseId: warehouse1Id,
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'WAREHOUSE_NOT_FOUND', status: 404 });
    });

    it('rejects offer with unsupported currency code', async () => {
      await expect(
        offerService.create(
          testSeller2Id,
          {
            variantId: testVariantId,
            priceMinor: '2000',
            currency: 'ZZZ' as never,
          },
          staffActor,
          {},
        ),
      ).rejects.toThrow();
    });
  });

  describe('Buybox competition & stock changes', () => {
    let offer2Id: string;

    it('seller 2 beats seller 1 price and takes the buybox', async () => {
      // Create warehouse for seller 2
      const s2Wh = await warehouseService.create(
        testSeller2Id,
        {
          name: 'Beta LA Depot',
          isDefault: true,
          address: {
            line1: '500 Sunset Blvd',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90028',
            country: 'US',
          },
        },
        staffActor,
        {},
      );

      // Seller 2 lists at $20.00 with 5 stock
      const offer2 = await offerService.create(
        testSeller2Id,
        {
          variantId: testVariantId,
          priceMinor: '2000', // $20.00 < $25.00
          currency: 'USD',
          warehouseId: s2Wh.id,
          initialStock: 5,
        },
        staffActor,
        {},
      );
      offer2Id = offer2.id;

      expect(offer2.isBuyboxWinner).toBe(true);

      const buybox = await buyboxService.get(testVariantId);
      expect(buybox?.winningOfferId).toBe(offer2.id);
      expect(buybox?.winningSellerId).toBe(testSeller2Id);
      expect(buybox?.winningPriceMinor).toBe('2000');
      expect(buybox?.sellerCount).toBe(2);
      expect(buybox?.minPriceMinor).toBe('2000');
      expect(buybox?.maxPriceMinor).toBe('2500');
    });

    it('seller 2 running out of stock returns buybox to seller 1', async () => {
      // Find seller 2's stock row
      const offer2 = await offerService.get(offer2Id);
      const stock = offer2.stocks[0]!;

      // Set stock onHand to 0
      await stockService.update(
        offer2Id,
        stock.warehouseId,
        {
          onHand: 0,
        },
        staffActor,
        {},
      );

      const updatedOffer2 = await offerService.get(offer2Id);
      expect(updatedOffer2.totalAvailable).toBe(0);
      expect(updatedOffer2.isBuyboxWinner).toBe(false);

      // Seller 1 now wins because they are in-stock
      const buybox = await buyboxService.get(testVariantId);
      expect(buybox?.winningSellerId).toBe(testSeller1Id);
      expect(buybox?.winningPriceMinor).toBe('2500');
    });

    it('seller 2 sale price wins buybox upon restocking', async () => {
      const offer2 = await offerService.get(offer2Id);
      const stock = offer2.stocks[0]!;

      // Update offer 2 with sale price $18.00
      await offerService.update(
        offer2Id,
        {
          salePriceMinor: '1800',
        },
        staffActor,
        {},
      );

      // Restock 3 items
      await stockService.update(
        offer2Id,
        stock.warehouseId,
        {
          onHand: 3,
        },
        staffActor,
        {},
      );

      const buybox = await buyboxService.get(testVariantId);
      expect(buybox?.winningOfferId).toBe(offer2Id);
      expect(buybox?.winningPriceMinor).toBe('1800');
    });

    it('soft-deleting seller 2 offer leaves seller 1 as winner', async () => {
      await offerService.remove(offer2Id, staffActor, {});

      const buybox = await buyboxService.get(testVariantId);
      expect(buybox?.winningSellerId).toBe(testSeller1Id);
      expect(buybox?.winningPriceMinor).toBe('2500');
      expect(buybox?.sellerCount).toBe(1);

      // Deleted offer cannot be fetched by get
      await expect(offerService.get(offer2Id)).rejects.toMatchObject({ code: 'OFFER_NOT_FOUND' });
    });

    it('verifies transactional outbox records were recorded', async () => {
      const outboxEntries = await prisma.inventoryOutbox.findMany({
        where: {
          aggregateType: 'offer',
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      expect(outboxEntries.length).toBeGreaterThanOrEqual(1);
      const events = outboxEntries.map((e) => e.eventType);
      expect(events).toContain('offer.created');
      expect(events).toContain('offer.deleted');
    });

    it('enforces optimistic concurrency control on offer updates (expectedUpdatedAt)', async () => {
      const current = await offerService.get(offer1Id);

      // Stale timestamp should reject with CONFLICT (409)
      await expect(
        offerService.update(
          offer1Id,
          {
            priceMinor: '2600',
            expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // Correct timestamp should succeed
      const updated = await offerService.update(
        offer1Id,
        {
          priceMinor: '2600',
          expectedUpdatedAt: current.updatedAt,
        },
        staffActor,
        {},
      );
      expect(updated.priceMinor).toBe('2600');
    });

    it('rejects offer update if salePriceMinor >= effective priceMinor', async () => {
      // offer1 currently has priceMinor 2600
      await expect(
        offerService.update(
          offer1Id,
          {
            salePriceMinor: '3000',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_SALE_PRICE_INVALID' });
    });

    it('rejects offer update if saleEndsAt <= effective saleStartsAt', async () => {
      // First update valid saleStartsAt
      const withStart = await offerService.update(
        offer1Id,
        {
          saleStartsAt: '2026-12-01T00:00:00.000Z',
        },
        staffActor,
        {},
      );
      expect(withStart.saleStartsAt).toBe('2026-12-01T00:00:00.000Z');

      // Attempting to set saleEndsAt before existing saleStartsAt must fail with OFFER_SALE_DATES_INVALID
      await expect(
        offerService.update(
          offer1Id,
          {
            saleEndsAt: '2026-11-01T00:00:00.000Z',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_SALE_DATES_INVALID' });
    });

    it('rejects offer update if maxQty < effective minQty', async () => {
      // Set minQty to 10
      await offerService.update(
        offer1Id,
        {
          minQty: 10,
        },
        staffActor,
        {},
      );

      // Attempting to set maxQty to 3 < 10 must fail with OFFER_ORDER_LIMITS_INVALID
      await expect(
        offerService.update(
          offer1Id,
          {
            maxQty: 3,
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_ORDER_LIMITS_INVALID' });
    });

    it('rejects offer update with mutually conflicting salePriceMinor and priceMinor in single payload', async () => {
      await expect(
        offerService.update(
          offer1Id,
          {
            priceMinor: '2000',
            salePriceMinor: '2500',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'OFFER_SALE_PRICE_INVALID' });
    });

    it('enforces optimistic concurrency control and atomic delta on stock updates', async () => {
      const current = await offerService.get(offer1Id);
      const stock = current.stocks[0]!;

      // Stale stock expectedUpdatedAt should reject with CONFLICT (409)
      await expect(
        stockService.update(
          offer1Id,
          stock.warehouseId,
          {
            onHand: 20,
            expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // Atomic delta increment
      const updatedStock = await stockService.update(
        offer1Id,
        stock.warehouseId,
        {
          delta: 5,
          expectedUpdatedAt: stock.updatedAt,
        },
        staffActor,
        {},
      );
      expect(updatedStock.onHand).toBe(stock.onHand + 5);
    });

    it('enforces optimistic concurrency control on warehouse updates (expectedUpdatedAt)', async () => {
      const wh = await warehouseService.get(warehouse1Id);

      await expect(
        warehouseService.update(
          warehouse1Id,
          { name: 'Concurrent Stale Depot', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const ok = await warehouseService.update(
        warehouse1Id,
        { name: 'Concurrent Fresh Depot', expectedUpdatedAt: wh.updatedAt },
        staffActor,
        {},
      );
      expect(ok.name).toBe('Concurrent Fresh Depot');
    });

    it('rejects offer mutations and stock adjustments on archived or pending products', async () => {
      const cat = await prisma.category.findFirstOrThrow({
        where: { slug: { startsWith: `itest-inv-${stamp}-` } },
      });
      const prodArchived = await prisma.product.create({
        data: {
          slug: s('archived-prod'),
          categoryId: cat.id,
          titleI18n: { en: s('Archived Item') },
          status: 'archived',
          deletedAt: new Date(),
        },
      });
      const varArchived = await prisma.variant.create({
        data: {
          productId: prodArchived.id,
          skuCode: s('SKU-ARCHIVED'),
          comboSignature: '',
          status: 'active',
        },
      });

      await expect(
        offerService.create(
          testSeller1Id,
          {
            variantId: varArchived.id,
            priceMinor: '1999',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'PRODUCT_PARENT_ARCHIVED', status: 409 });

      const prodPending = await prisma.product.create({
        data: {
          slug: s('pending-prod'),
          categoryId: cat.id,
          titleI18n: { en: s('Pending Item') },
          status: 'pending',
        },
      });
      const varPending = await prisma.variant.create({
        data: {
          productId: prodPending.id,
          skuCode: s('SKU-PENDING'),
          comboSignature: '',
          status: 'active',
        },
      });

      await expect(
        offerService.create(
          testSeller1Id,
          {
            variantId: varPending.id,
            priceMinor: '1999',
            currency: 'USD',
          },
          staffActor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'PRODUCT_IN_REVIEW', status: 409 });

      const liveProduct = await prisma.product.findFirstOrThrow({
        where: { slug: s('inv-product') },
      });
      await prisma.product.update({
        where: { id: liveProduct.id },
        data: { status: 'archived', deletedAt: new Date() },
      });

      await expect(
        stockService.update(offer1Id, warehouse1Id, { delta: 1 }, staffActor, {}),
      ).rejects.toMatchObject({ code: 'PRODUCT_PARENT_ARCHIVED', status: 409 });

      await prisma.product.update({
        where: { id: liveProduct.id },
        data: { status: 'pending', deletedAt: null },
      });

      await expect(
        stockService.update(offer1Id, warehouse1Id, { delta: 1 }, staffActor, {}),
      ).rejects.toMatchObject({ code: 'PRODUCT_IN_REVIEW', status: 409 });

      await prisma.product.update({
        where: { id: liveProduct.id },
        data: { status: 'active', deletedAt: null },
      });
    });
  });
});
