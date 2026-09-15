import { Inject, Injectable } from '@nestjs/common';
import type {
  StaffLoginRequest,
  StaffSessionResponse,
  StaffTotpConfirmRequest,
  TotpConfirmResponse,
  TotpEnrolmentChallenge,
} from '@shopnetic/contracts';
import type { Account } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, authRelaxed, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';
import { SessionService, type SessionContext, type IssuedSession } from './session.service.js';
import { AccessTokenService, STAFF_AUDIENCE } from './access-token.service.js';
import { MailService } from './mail.service.js';
import { PasswordResetService } from './password-reset.service.js';
import type { RequestMeta } from './identity.service.js';

type LoginOutcome =
  | { kind: 'session'; response: StaffSessionResponse; session: IssuedSession }
  | { kind: 'enrolment'; challenge: TotpEnrolmentChallenge };

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
    private readonly accessTokens: AccessTokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  private staffRefreshTtlMs(): number {
    return this.env.AUTH_STAFF_REFRESH_TTL_HOURS * 3_600_000;
  }

  /** Step 1: password. Returns a session, or a TOTP challenge if not yet enrolled. */
  async login(input: StaffLoginRequest, ctx: SessionContext): Promise<LoginOutcome> {
    const account = await this.authenticatePassword(input.email, input.password, ctx);

    if (authRelaxed(this.env)) {
      const relaxed = await this.startSession(account, ctx);
      return { kind: 'session', ...relaxed };
    }

    if (!(await this.totp.isEnrolled(account.id))) {
      const { secret, otpauthUri } = await this.totp.beginEnrolment(account.id, account.email);
      return {
        kind: 'enrolment',
        challenge: { status: 'totp_enrolment_required', secret, otpauthUri },
      };
    }

    if (!input.code) {
      throw new AppError('MFA_REQUIRED', 401, { detail: 'authenticator code required' });
    }
    if (!(await this.totp.verifyLoginCode(account.id, input.code))) {
      await this.recordFailure(account.id, 'identity.staff_mfa_failed', ctx);
      throw new AppError('MFA_INVALID', 401, { detail: 'code did not match' });
    }

    const { response, session } = await this.startSession(account, ctx);
    return { kind: 'session', response, session };
  }

  /** Step 2 (first login only): confirm the authenticator, get recovery codes + a session. */
  async confirmEnrolment(
    input: StaffTotpConfirmRequest,
    ctx: SessionContext,
  ): Promise<{ response: TotpConfirmResponse; session: IssuedSession }> {
    const account = await this.authenticatePassword(input.email, input.password, ctx);
    const recoveryCodes = await this.totp.confirmEnrolment(account.id, input.code);

    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.totp_enrolled',
      targetType: 'account',
      targetId: account.id,
      ...pick(ctx),
    });

    const { response, session } = await this.startSession(account, ctx);
    return { response: { ...response, recoveryCodes }, session };
  }

  async refresh(
    presentedToken: string,
    ctx: SessionContext,
  ): Promise<{ tokens: StaffSessionResponse['tokens']; session: IssuedSession }> {
    const session = await this.sessions.rotate(presentedToken, ctx);
    const tokens = await this.accessTokens.issue(
      session.accountId,
      session.sessionId,
      STAFF_AUDIENCE,
    );
    return { tokens, session };
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (presentedToken) await this.sessions.revokeByToken(presentedToken, 'logout');
  }

  /** Self-service password change — proven by supplying the current password,
   * not gated by a permission (every staff member may change their own).
   * Revokes every session on the account, this one included: the caller's
   * current access token stays valid until it naturally expires (it's a
   * self-contained JWT, not session-checked per request), but the next
   * refresh anywhere — this tab too — fails and lands back on login, so the
   * new password is the one that's actually in effect everywhere. */
  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestMeta = {},
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { credential: true },
    });
    if (!account?.credential) {
      throw new AppError('INVALID_CREDENTIALS', 401, { detail: 'no credential on file' });
    }
    if (!(await this.passwords.verify(account.credential.passwordHash, currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', 401, { detail: 'current password is wrong' });
    }
    await this.passwords.assertNotBreached(newPassword);

    await this.prisma.credential.update({
      where: { accountId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.sessions.revokeAllForAccount(accountId, 'password_change');
    await this.audit.record({
      actorAccountId: accountId,
      action: 'identity.staff_password_changed',
      targetType: 'account',
      targetId: accountId,
      ...pick(ctx),
    });
  }

  async readSession(presentedToken: string | undefined): Promise<StaffSessionResponse['user']> {
    if (!presentedToken) throw AppError.unauthenticated('UNAUTHENTICATED', 'no session cookie');
    const { accountId } = await this.sessions.resolveActive(presentedToken);
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.plane !== 'staff' || account.status !== 'active') {
      throw AppError.unauthenticated('UNAUTHENTICATED', 'account unavailable');
    }
    return toUser(account, await this.rolesFor(account.id));
  }

  /** Always resolves, whether or not the email belongs to an active staff
   * account — enumeration-safe, same shape as the buyer-plane register flow.
   * Only sends mail (and only issues a token) when it actually does. */
  async forgotPassword(email: string, ctx: SessionContext = {}): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account || account.plane !== 'staff' || account.status !== 'active') return;

    const token = await this.passwordReset.issue(account.id);
    await this.mail.sendStaffPasswordReset(account.email, this.resetUrl(token));
    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.staff_password_reset_requested',
      targetType: 'account',
      targetId: account.id,
      ...pick(ctx),
    });
  }

  async resetPassword(token: string, newPassword: string, ctx: SessionContext = {}): Promise<void> {
    const { accountId } = await this.passwordReset.consume(token);
    await this.passwords.assertNotBreached(newPassword);

    await this.prisma.credential.update({
      where: { accountId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.sessions.revokeAllForAccount(accountId, 'password_change');
    await this.audit.record({
      actorAccountId: accountId,
      action: 'identity.staff_password_reset',
      targetType: 'account',
      targetId: accountId,
      ...pick(ctx),
    });
  }

  private resetUrl(token: string): string {
    return `${this.env.ADMIN_WEB_URL}/en/${this.env.ADMIN_BASE_PATH}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private async authenticatePassword(
    email: string,
    password: string,
    ctx: SessionContext,
  ): Promise<Account> {
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { credential: true },
    });
    const ok = account?.credential
      ? await this.passwords.verify(account.credential.passwordHash, password)
      : await this.passwords.verifyDummy(password).then(() => false);

    if (!account || account.plane !== 'staff' || !account.credential || !ok) {
      await this.audit.record({
        actorAccountId: account?.plane === 'staff' ? account.id : null,
        action: 'identity.staff_login_failed',
        targetType: 'email',
        targetId: email,
        ...pick(ctx),
      });
      throw new AppError('INVALID_CREDENTIALS', 401, { detail: 'email or password is wrong' });
    }
    if (account.status !== 'active') {
      throw new AppError('ACCOUNT_LOCKED', 403, { detail: `account status is ${account.status}` });
    }
    return account;
  }

  private async startSession(
    account: Account,
    ctx: SessionContext,
  ): Promise<{ response: StaffSessionResponse; session: IssuedSession }> {
    const session = await this.sessions.create(account.id, ctx, this.staffRefreshTtlMs());
    const tokens = await this.accessTokens.issue(account.id, session.sessionId, STAFF_AUDIENCE);
    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.staff_session_created',
      targetType: 'session',
      targetId: session.sessionId,
      ...pick(ctx),
    });
    return {
      response: { tokens, user: toUser(account, await this.rolesFor(account.id)) },
      session,
    };
  }

  private async recordFailure(
    accountId: string,
    action: string,
    ctx: SessionContext,
  ): Promise<void> {
    await this.audit.record({
      actorAccountId: accountId,
      action,
      targetType: 'account',
      targetId: accountId,
      ...pick(ctx),
    });
  }

  /** Distinct role keys the account holds (e.g. `['SUPER_ADMIN']`, or several
   * for a multi-role account) — drives client-side nav visibility; the API
   * itself never trusts this, `@RequirePermission` is the real gate. */
  private async rolesFor(accountId: string): Promise<string[]> {
    const grants = await this.prisma.grant.findMany({
      where: { accountId },
      include: { role: true },
    });
    return [...new Set(grants.map((g) => g.role.key))];
  }
}

function toUser(account: Account, roles: string[]): StaffSessionResponse['user'] {
  return {
    id: account.id,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    roles,
  };
}

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}
