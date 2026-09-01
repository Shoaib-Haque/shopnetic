import { Inject, Injectable } from '@nestjs/common';
import { ARGON2_PARAMS, isStaffRole } from '@shopnetic/auth';
import type { StaffInviteAcceptRequest, StaffInviteCreateRequest } from '@shopnetic/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from './mail.service.js';
import { PasswordService } from './password.service.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';
import type { RequestMeta } from './identity.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invite-only staff onboarding (plan/03 §1). */
@Injectable()
export class StaffInviteService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: StaffInviteCreateRequest,
    invitedByAccountId: string,
    meta: RequestMeta = {},
  ): Promise<{ email: string }> {
    if (!isStaffRole(input.role)) {
      throw new AppError('VALIDATION_ERROR', 422, { detail: `${input.role} is not a staff role` });
    }

    // A staff address must be distinct from any existing account (plan/03 §6).
    const existing = await this.prisma.account.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError('INVITE_EMAIL_TAKEN', 409, {
        detail: 'that email already has an account; staff must use a separate address',
      });
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: input.role } });
    const token = generateOpaqueToken();

    // Supersede any earlier un-accepted invite for the same email.
    await this.prisma.staffInvite.updateMany({
      where: { email: input.email, acceptedAt: null },
      data: { expiresAt: new Date() },
    });
    await this.prisma.staffInvite.create({
      data: {
        email: input.email,
        roleId: role.id,
        invitedByAccountId,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    await this.mail.sendStaffInvite(input.email, this.acceptUrl(token), input.role);
    await this.audit.record({
      actorAccountId: invitedByAccountId,
      action: 'identity.staff_invited',
      targetType: 'email',
      targetId: input.email,
      after: { role: input.role },
      ...pick(meta),
    });
    return { email: input.email };
  }

  async accept(
    input: StaffInviteAcceptRequest,
    meta: RequestMeta = {},
  ): Promise<{ accountId: string }> {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: hashOpaqueToken(input.token) },
      include: { role: true },
    });
    if (!invite || invite.acceptedAt != null) {
      throw new AppError('INVITE_INVALID', 400, { detail: 'unknown or already-used invite' });
    }
    if (invite.expiresAt <= new Date()) {
      throw new AppError('INVITE_EXPIRED', 410, { detail: 'invite expired' });
    }
    if (await this.prisma.account.findUnique({ where: { email: invite.email } })) {
      throw new AppError('INVITE_EMAIL_TAKEN', 409, {
        detail: 'an account with this email now exists',
      });
    }

    await this.passwords.assertNotBreached(input.password);
    const passwordHash = await this.passwords.hash(input.password);

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          email: invite.email,
          plane: 'staff',
          status: 'active',
          emailVerifiedAt: new Date(), // the invite link proved email control
          credential: { create: { passwordHash, hashAlgo: 'argon2id', params: ARGON2_PARAMS } },
          grants: { create: { roleId: invite.roleId, scopeType: 'global', scopeId: null } },
        },
      });
      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedAccountId: created.id },
      });
      return created;
    });

    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.staff_invite_accepted',
      targetType: 'account',
      targetId: account.id,
      after: { role: invite.role.key },
      ...pick(meta),
    });
    return { accountId: account.id };
  }

  private acceptUrl(token: string): string {
    const base = this.env.ADMIN_WEB_URL;
    return `${base}/en/${this.env.ADMIN_BASE_PATH}/accept-invite?token=${encodeURIComponent(token)}`;
  }
}

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}
