import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from './session.service.js';
import { StaffAccountsService } from './staff-accounts.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('StaffAccountsService (integration)', () => {
  let prisma: PrismaClient;
  let sessions: SessionService;
  let accounts: StaffAccountsService;
  let superAdminId: string;
  let targetId: string;
  const stamp = Date.now();
  const targetEmail = `itest-target-${stamp}@shopnetic.test`;
  const superAdminEmail = `itest-super-${stamp}@shopnetic.test`;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const px = prisma as PrismaService;
    const audit = new AuditService(px);
    sessions = new SessionService(px, { AUTH_REFRESH_TTL_DAYS: 30 } as never, audit);
    accounts = new StaffAccountsService(px, sessions, audit);

    const [adminRole, superRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } }),
      prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } }),
    ]);

    const superAdmin = await prisma.account.create({
      data: {
        email: superAdminEmail,
        plane: 'staff',
        status: 'active',
        emailVerifiedAt: new Date(),
        grants: { create: { roleId: superRole.id, scopeType: 'global', scopeId: null } },
      },
    });
    superAdminId = superAdmin.id;

    const target = await prisma.account.create({
      data: {
        email: targetEmail,
        plane: 'staff',
        status: 'active',
        emailVerifiedAt: new Date(),
        grants: { create: { roleId: adminRole.id, scopeType: 'global', scopeId: null } },
      },
    });
    targetId = target.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [superAdminId, targetId].filter(Boolean);
    await prisma.session.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.recoveryCode.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.totpSecret.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.grant.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('lists staff accounts, including the freshly created target with its role', async () => {
    // generous limit — this test only cares that the target shows up
    // correctly, not about pagination itself (see the dedicated test below)
    const { accounts: list } = await accounts.list(undefined, 100);
    const found = list.find((a) => a.id === targetId);
    expect(found).toBeDefined();
    expect(found?.roles).toEqual(['ADMIN']);
    expect(found?.status).toBe('active');
    expect(found?.totpEnrolled).toBe(false);
  });

  it('paginates with a cursor, oldest first — the second page never repeats the first', async () => {
    const first = await accounts.list(undefined, 1);
    expect(first.accounts).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();

    const second = await accounts.list(first.nextCursor, 1);
    expect(second.accounts).toHaveLength(1);
    expect(second.accounts[0]?.id).not.toBe(first.accounts[0]?.id);

    // walking the whole list this way eventually reaches our two fixtures
    // without ever repeating an id
    const seen = new Set([first.accounts[0]!.id, second.accounts[0]!.id]);
    let cursor = second.nextCursor;
    let guard = 0;
    while (cursor && !(seen.has(superAdminId) && seen.has(targetId)) && guard++ < 50) {
      const page = await accounts.list(cursor, 5);
      for (const a of page.accounts) {
        expect(seen.has(a.id)).toBe(false);
        seen.add(a.id);
      }
      cursor = page.nextCursor;
    }
    expect(seen.has(superAdminId)).toBe(true);
    expect(seen.has(targetId)).toBe(true);
  });

  it('changes a role, replacing the old grant rather than adding to it', async () => {
    const updated = await accounts.changeRole(targetId, 'SERVICE_ADMIN', superAdminId);
    expect(updated.roles).toEqual(['SERVICE_ADMIN']);

    const grants = await prisma.grant.findMany({ where: { accountId: targetId } });
    expect(grants).toHaveLength(1); // not 2 — the old ADMIN grant was replaced, not kept
  });

  it('refuses to let an actor change their own role', async () => {
    await expect(accounts.changeRole(superAdminId, 'ADMIN', superAdminId)).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
  });

  it('refuses to activate an account that is already active', async () => {
    await expect(accounts.activate(targetId, superAdminId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('activates a locked account', async () => {
    await prisma.account.update({ where: { id: targetId }, data: { status: 'locked' } });
    const updated = await accounts.activate(targetId, superAdminId);
    expect(updated.status).toBe('active');
  });

  it('resets TOTP enrolment: clears the secret and recovery codes', async () => {
    await prisma.totpSecret.create({
      data: { accountId: targetId, secretEncrypted: 'v1.fake.fake.fake', confirmedAt: new Date() },
    });
    await prisma.recoveryCode.create({
      data: { accountId: targetId, codeHash: 'fakehash' },
    });

    const updated = await accounts.resetTotp(targetId, superAdminId);
    expect(updated.totpEnrolled).toBe(false);

    const remaining = await prisma.recoveryCode.findMany({ where: { accountId: targetId } });
    expect(remaining).toHaveLength(0);
  });

  it('deprovisions an account: status disabled, every active session revoked', async () => {
    const session = await sessions.create(targetId, {});

    const updated = await accounts.deprovision(targetId, superAdminId);
    expect(updated.status).toBe('disabled');

    const row = await prisma.session.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedReason).toBe('admin');
  });

  it('refuses to let an actor deprovision their own account', async () => {
    await expect(accounts.deprovision(superAdminId, superAdminId)).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
  });

  it('reactivates a deprovisioned (disabled) account — the bug report this fixes', async () => {
    // targetId is 'disabled' from the deprovision test just above; before this
    // fix, activate() only accepted 'locked', so a deprovisioned account had
    // no way back to active at all.
    const updated = await accounts.activate(targetId, superAdminId);
    expect(updated.status).toBe('active');
  });

  it('404s on an accountId that is not a staff account', async () => {
    const marketplace = await prisma.account.create({
      data: {
        email: `itest-marketplace-${stamp}@shopnetic.test`,
        plane: 'marketplace',
        status: 'active',
      },
    });
    await expect(accounts.activate(marketplace.id, superAdminId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await prisma.account.delete({ where: { id: marketplace.id } });
  });
});
