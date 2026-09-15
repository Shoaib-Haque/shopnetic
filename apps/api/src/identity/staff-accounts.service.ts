import { Injectable } from '@nestjs/common';
import type { StaffAccount, StaffRole } from '@shopnetic/contracts';
import type { Account } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from './session.service.js';
import type { RequestMeta } from './identity.service.js';

type AccountWithGrantsAndTotp = Account & {
  grants: { role: { key: string } }[];
  totpSecret: { confirmedAt: Date | null } | null;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/**
 * The staff directory: list + the account-lifecycle actions a Super Admin
 * needs (`staff:manage` — enforced by the controller's `@RequirePermission`,
 * not here). Kept separate from `StaffAuthService` (the login/session flow)
 * and `StaffInviteService` (onboarding) — this is about *existing* accounts.
 */
@Injectable()
export class StaffAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** Ordered by `id`, not `createdAt` — a v7 UUID sorts by creation time the
   * same way `createdAt` would, but is the stable, unique field keyset
   * pagination actually needs (matches `AuditController`'s same choice). */
  async list(
    cursor?: string,
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<{
    accounts: StaffAccount[];
    nextCursor?: string;
  }> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
    const accounts = await this.prisma.account.findMany({
      where: { plane: 'staff', deletedAt: null },
      include: { grants: { include: { role: true } }, totpSecret: true },
      orderBy: { id: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const page = accounts.slice(0, take);
    const nextCursor = accounts.length > take ? page.at(-1)?.id : undefined;
    return { accounts: page.map(toStaffAccount), ...(nextCursor ? { nextCursor } : {}) };
  }

  async changeRole(
    accountId: string,
    role: StaffRole,
    actorAccountId: string,
    meta: RequestMeta = {},
  ): Promise<StaffAccount> {
    this.assertNotSelf(accountId, actorAccountId, 'change your own role');
    await this.requireStaffAccount(accountId);
    const roleRow = await this.prisma.role.findUniqueOrThrow({ where: { key: role } });

    await this.prisma.$transaction([
      this.prisma.grant.deleteMany({ where: { accountId, scopeType: 'global' } }),
      this.prisma.grant.create({
        data: { accountId, roleId: roleRow.id, scopeType: 'global', scopeId: null },
      }),
    ]);
    await this.audit.record({
      actorAccountId,
      action: 'identity.staff_role_changed',
      targetType: 'account',
      targetId: accountId,
      after: { role },
      ...pick(meta),
    });
    return this.view(accountId);
  }

  /** Both `locked` (an automatic lockout) and `disabled` (a deliberate
   * `deprovision`) come back via the same status flip — there's no
   * meaningful difference in the mechanism, only in why the account got
   * there, which the caller already knows from `status` and reflects in
   * the button copy ("Unlock" vs "Reactivate"). */
  async activate(
    accountId: string,
    actorAccountId: string,
    meta: RequestMeta = {},
  ): Promise<StaffAccount> {
    const account = await this.requireStaffAccount(accountId);
    if (account.status !== 'locked' && account.status !== 'disabled') {
      throw new AppError('VALIDATION_ERROR', 422, { detail: 'account is already active' });
    }
    await this.prisma.account.update({ where: { id: accountId }, data: { status: 'active' } });
    await this.audit.record({
      actorAccountId,
      action: 'identity.staff_activated',
      targetType: 'account',
      targetId: accountId,
      before: { status: account.status },
      after: { status: 'active' },
      ...pick(meta),
    });
    return this.view(accountId);
  }

  /** Clears the account's TOTP enrolment (and any recovery codes) so the next
   * login starts enrolment fresh — for someone locked out with no phone and
   * no recovery codes left. */
  async resetTotp(
    accountId: string,
    actorAccountId: string,
    meta: RequestMeta = {},
  ): Promise<StaffAccount> {
    await this.requireStaffAccount(accountId);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { accountId } }),
      this.prisma.totpSecret.deleteMany({ where: { accountId } }),
    ]);
    await this.audit.record({
      actorAccountId,
      action: 'identity.staff_totp_reset',
      targetType: 'account',
      targetId: accountId,
      ...pick(meta),
    });
    return this.view(accountId);
  }

  async deprovision(
    accountId: string,
    actorAccountId: string,
    meta: RequestMeta = {},
  ): Promise<StaffAccount> {
    this.assertNotSelf(accountId, actorAccountId, 'deprovision your own account');
    await this.requireStaffAccount(accountId);
    await this.prisma.account.update({ where: { id: accountId }, data: { status: 'disabled' } });
    await this.sessions.revokeAllForAccount(accountId, 'admin');
    await this.audit.record({
      actorAccountId,
      action: 'identity.staff_deprovisioned',
      targetType: 'account',
      targetId: accountId,
      ...pick(meta),
    });
    return this.view(accountId);
  }

  private assertNotSelf(accountId: string, actorAccountId: string, detail: string): void {
    if (accountId === actorAccountId) {
      throw new AppError('CANNOT_MODIFY_SELF', 409, { detail: `cannot ${detail}` });
    }
  }

  private async requireStaffAccount(accountId: string): Promise<Account> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.plane !== 'staff') {
      throw new AppError('NOT_FOUND', 404, { detail: 'no such staff account' });
    }
    return account;
  }

  private async view(accountId: string): Promise<StaffAccount> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { grants: { include: { role: true } }, totpSecret: true },
    });
    return toStaffAccount(account);
  }
}

function toStaffAccount(account: AccountWithGrantsAndTotp): StaffAccount {
  return {
    id: account.id,
    email: account.email,
    status: account.status,
    roles: [...new Set(account.grants.map((g) => g.role.key))] as StaffAccount['roles'],
    totpEnrolled: account.totpSecret?.confirmedAt != null,
    createdAt: account.createdAt.toISOString(),
  };
}

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}
