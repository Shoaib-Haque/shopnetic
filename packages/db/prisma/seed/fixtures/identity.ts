/**
 * Identity fixtures — the account states screens must handle: locked, disabled,
 * unverified email, a very long display email, every staff role, a pending
 * invite. Dev / CI only.
 */
import { Role } from '@shopnetic/auth';
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import { upsertAccount } from '../factories.js';

export async function seedFixtureIdentity(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  await upsertAccount(prisma, ctx, {
    email: 'locked-staff@shopnetic.test',
    plane: 'staff',
    password: 'fixture-pw-000000',
    status: 'locked',
    roles: [Role.ADMIN],
  });
  await upsertAccount(prisma, ctx, {
    email: 'disabled-staff@shopnetic.test',
    plane: 'staff',
    password: 'fixture-pw-000000',
    status: 'disabled',
    roles: [Role.SERVICE_ADMIN],
  });
  await upsertAccount(prisma, ctx, {
    email: 'unverified-buyer@shopnetic.test',
    plane: 'marketplace',
    password: 'fixture-pw-000000',
    emailVerified: false,
    roles: [Role.BUYER],
  });
  await upsertAccount(prisma, ctx, {
    email:
      'a-very-long-email-address-for-column-truncation-testing@really-long-domain.example.test',
    plane: 'marketplace',
    password: 'fixture-pw-000000',
    roles: [Role.BUYER],
  });
  await upsertAccount(prisma, ctx, {
    email: 'multi-role-staff@shopnetic.test',
    plane: 'staff',
    password: 'fixture-pw-000000',
    roles: [Role.ADMIN, Role.SERVICE_ADMIN],
  });

  // a pending (unaccepted) staff invite — inviter is the demo admin
  const inviter = ctx.account.get('admin@shopnetic.test');
  if (inviter) {
    const email = 'pending-invite@shopnetic.test';
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: Role.ADMIN } });
    const existing = await prisma.staffInvite.findFirst({ where: { email, acceptedAt: null } });
    if (!existing) {
      await prisma.staffInvite.create({
        data: {
          email,
          roleId: adminRole.id,
          invitedByAccountId: inviter,
          tokenHash: `fixture-invite-${Date.now().toString(36)}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });
    }
  }

  log.info({}, 'identity fixtures seeded');
}
