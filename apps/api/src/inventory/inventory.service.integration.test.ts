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
    await prisma.$disconnect();
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

      const list = await warehouseService.list(testSeller1Id);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe(wh1.id); // default first
      expect(list.some((w) => w.id === warehouse2Id)).toBe(true);
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
  });
});
