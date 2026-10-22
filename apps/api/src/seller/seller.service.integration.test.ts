import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import { Permission, type Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SellerService } from './seller.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('SellerService (integration)', () => {
  let prisma: PrismaClient;
  let sellerService: SellerService;
  let staffActor: Actor;
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = (x: string): string => `itest-seller-${stamp}-${x}`;

  let sellerId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    sellerService = new SellerService(pr, audit);

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
          permissions: [Permission.STAFF_MANAGE],
        },
      ],
    };

    const sellerAccount = await prisma.account.create({
      data: {
        email: `${s('vendor')}@shopnetic.test`,
        plane: 'marketplace',
        status: 'active',
      },
    });
    const sellerActor: Actor = {
      accountId: sellerAccount.id,
      plane: 'marketplace',
      grants: [],
    };

    const created = await sellerService.create(
      {
        legalName: 'Acme Marketplace Vendor LLC',
        type: 'business',
        country: 'US',
        shop: {
          slug: s('acme-shop'),
          displayName: 'Acme Direct',
        },
      },
      sellerActor,
      {},
    );
    sellerId = created.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (sellerId) {
        await prisma.shop.deleteMany({ where: { sellerId } });
        await prisma.seller.deleteMany({ where: { id: sellerId } });
      }
      const testAccounts = await prisma.account.findMany({
        where: { email: { startsWith: `itest-seller-${stamp}-` } },
        select: { id: true },
      });
      const accountIds = testAccounts.map((a) => a.id);
      if (accountIds.length > 0) {
        await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: accountIds } } });
        await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('gets seller by id, accountId, and shop slug', async () => {
    const byId = await sellerService.get(sellerId);
    expect(byId.id).toBe(sellerId);
    expect(byId.legalName).toBe('Acme Marketplace Vendor LLC');

    const byAccount = await sellerService.getByAccountId(byId.accountId);
    expect(byAccount?.id).toBe(sellerId);

    const bySlug = await sellerService.getByShopSlug(s('acme-shop'));
    expect(bySlug?.id).toBe(sellerId);
  });

  it('enforces optimistic concurrency control on updateStatus (expectedUpdatedAt)', async () => {
    const current = await sellerService.get(sellerId);

    // Stale expectedUpdatedAt throws CONFLICT (409)
    await expect(
      sellerService.updateStatus(
        sellerId,
        {
          status: 'suspended',
          reason: 'Routine compliance audit',
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        },
        staffActor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

    // Correct expectedUpdatedAt succeeds
    const updated = await sellerService.updateStatus(
      sellerId,
      {
        status: 'suspended',
        reason: 'Routine compliance audit',
        expectedUpdatedAt: current.updatedAt,
      },
      staffActor,
      {},
    );
    expect(updated.status).toBe('suspended');

    // Fresh get reflects updated timestamp
    const fresh = await sellerService.get(sellerId);
    expect(fresh.status).toBe('suspended');
    expect(fresh.updatedAt).not.toBe(current.updatedAt);
  });
});
