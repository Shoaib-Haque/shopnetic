/**
 * Demo identity — a couple of extra staff and buyers so screens that list
 * accounts aren't empty. Passwords are the obvious dev ones; harmless because
 * this never runs in production (see `resolveProfile`).
 */
import { Role } from '@shopnetic/auth';
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import { upsertAccount } from '../factories.js';

export async function seedDemoIdentity(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  await upsertAccount(prisma, ctx, {
    email: 'admin@shopnetic.test',
    plane: 'staff',
    password: 'demo-admin-pw-123',
    roles: [Role.ADMIN],
  });
  await upsertAccount(prisma, ctx, {
    email: 'service@shopnetic.test',
    plane: 'staff',
    password: 'demo-service-pw-123',
    roles: [Role.SERVICE_ADMIN],
  });
  await upsertAccount(prisma, ctx, {
    email: 'buyer@shopnetic.test',
    plane: 'marketplace',
    password: 'demo-buyer-pw-123',
    roles: [Role.BUYER],
  });
  await upsertAccount(prisma, ctx, {
    email: 'seller@shopnetic.test',
    plane: 'marketplace',
    password: 'demo-seller-pw-123',
    roles: [Role.SELLER],
  });

  log.info({ accounts: ctx.account.size }, 'demo identity seeded');
}
