import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import { Permission } from '@shopnetic/auth';
import { ActorService } from './actor.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('ActorService (integration)', () => {
  let prisma: PrismaClient;
  let actors: ActorService;
  let buyerId: string;
  let adminId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    actors = new ActorService(prisma as PrismaService);

    const [buyerRole, svcAdminRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: 'BUYER' } }),
      prisma.role.findUniqueOrThrow({ where: { key: 'SERVICE_ADMIN' } }),
    ]);

    const stamp = Date.now();
    const buyer = await prisma.account.create({
      data: {
        email: `itest-buyer-${stamp}@shopnetic.test`,
        plane: 'marketplace',
        status: 'active',
        emailVerifiedAt: new Date(),
        grants: { create: { roleId: buyerRole.id, scopeType: 'self', scopeId: null } },
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.account.create({
      data: {
        email: `itest-admin-${stamp}@shopnetic.test`,
        plane: 'staff',
        status: 'active',
        emailVerifiedAt: new Date(),
        grants: { create: { roleId: svcAdminRole.id, scopeType: 'global', scopeId: null } },
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.grant.deleteMany({ where: { accountId: { in: [buyerId, adminId] } } });
    await prisma.account.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.$disconnect();
  });

  it('assembles a buyer actor: BUYER permissions, self scope, no staff powers', async () => {
    const actor = await actors.forAccount(buyerId);
    expect(actor).not.toBeNull();
    expect(actor?.plane).toBe('marketplace');

    const perms = new Set(actor?.grants.flatMap((g) => g.permissions) ?? []);
    expect(perms.has(Permission.ORDER_PLACE)).toBe(true);
    expect(perms.has(Permission.CATALOG_BROWSE)).toBe(true);
    expect(perms.has(Permission.AUDITLOG_READ)).toBe(false);
    expect(actor?.grants.every((g) => g.scopeType === 'self')).toBe(true);
  });

  it('assembles a service-admin actor: global grant carrying auditlog:read', async () => {
    const actor = await actors.forAccount(adminId);
    expect(actor?.plane).toBe('staff');

    const global = actor?.grants.find((g) => g.scopeType === 'global');
    expect(global).toBeDefined();
    expect(global?.permissions).toContain(Permission.AUDITLOG_READ);
    expect(global?.permissions).toContain(Permission.REPORT_RESOLVE);
    expect(global?.permissions).not.toContain(Permission.STAFF_MANAGE);
  });

  it('returns null for an unknown or non-active account', async () => {
    expect(await actors.forAccount('00000000-0000-7000-8000-000000000000')).toBeNull();

    await prisma.account.update({ where: { id: buyerId }, data: { status: 'disabled' } });
    expect(await actors.forAccount(buyerId)).toBeNull();
    await prisma.account.update({ where: { id: buyerId }, data: { status: 'active' } });
  });
});
