import { Inject, Injectable } from '@nestjs/common';
import { ARGON2_PARAMS, Role } from '@shopnetic/auth';
import type {
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  SessionUser,
  VerifyEmailRequest,
} from '@shopnetic/contracts';
import type { Account } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, authRelaxed, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { VerificationService } from './verification.service.js';
import { MailService } from './mail.service.js';
import { SessionService, type SessionContext, type IssuedSession } from './session.service.js';
import { AccessTokenService } from './access-token.service.js';

export interface LoginResult {
  tokens: Awaited<ReturnType<AccessTokenService['issue']>>;
  user: SessionUser;
  session: IssuedSession;
}

/** Request metadata carried into audit rows. */
export interface RequestMeta {
  ip?: string;
  correlationId?: string;
}

function auditMeta(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly passwords: PasswordService,
    private readonly verification: VerificationService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
    private readonly accessTokens: AccessTokenService,
    private readonly audit: AuditService,
  ) {}

  /** Enumeration-safe: same response whether or not the email is already taken. */
  async register(
    input: RegisterRequest,
    meta: RequestMeta = {},
  ): Promise<{ email: string; verificationRequired: true }> {
    await this.passwords.assertNotBreached(input.password);

    const existing = await this.prisma.account.findUnique({ where: { email: input.email } });
    if (existing) {
      await this.mail.sendAlreadyRegistered(input.email, this.loginUrl());
      return { email: input.email, verificationRequired: true };
    }

    const passwordHash = await this.passwords.hash(input.password);
    const buyerRole = await this.prisma.role.findUniqueOrThrow({ where: { key: Role.BUYER } });
    const account = await this.prisma.account.create({
      data: {
        email: input.email,
        plane: 'marketplace',
        status: 'active',
        ...(authRelaxed(this.env) ? { emailVerifiedAt: new Date() } : {}),
        credential: { create: { passwordHash, hashAlgo: 'argon2id', params: ARGON2_PARAMS } },
        grants: { create: { roleId: buyerRole.id, scopeType: 'self', scopeId: null } },
      },
    });

    // TODO(outbox): write identity.account_registered inside this write path.
    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.account_registered',
      targetType: 'account',
      targetId: account.id,
      after: { email: account.email, plane: account.plane },
      ...auditMeta(meta),
    });

    const token = await this.verification.issue(account.id);
    await this.mail.sendVerification(input.email, this.verifyUrl(token));
    return { email: input.email, verificationRequired: true };
  }

  async verifyEmail(
    input: VerifyEmailRequest,
    meta: RequestMeta = {},
  ): Promise<{ verified: true }> {
    const { accountId } = await this.verification.consume(input.token);
    await this.audit.record({
      actorAccountId: accountId,
      action: 'identity.email_verified',
      targetType: 'account',
      targetId: accountId,
      ...auditMeta(meta),
    });
    return { verified: true };
  }

  async resendVerification(input: ResendVerificationRequest): Promise<{ ok: true }> {
    const account = await this.prisma.account.findUnique({ where: { email: input.email } });
    if (account && account.emailVerifiedAt === null && account.status === 'active') {
      const token = await this.verification.issue(account.id);
      await this.mail.sendVerification(input.email, this.verifyUrl(token));
    }
    return { ok: true };
  }

  async login(input: LoginRequest, ctx: SessionContext): Promise<LoginResult> {
    const account = await this.prisma.account.findUnique({
      where: { email: input.email },
      include: { credential: true },
    });

    const passwordOk = account?.credential
      ? await this.passwords.verify(account.credential.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password).then(() => false);

    if (!account || !account.credential || !passwordOk) {
      await this.audit.record({
        actorAccountId: account?.id ?? null,
        action: 'identity.login_failed',
        targetType: 'email',
        targetId: input.email,
        reason: account ? 'wrong password' : 'no such account',
        ...auditMeta(ctx),
      });
      throw new AppError('INVALID_CREDENTIALS', 401, { detail: 'email or password is wrong' });
    }
    if (account.status !== 'active') {
      throw new AppError('ACCOUNT_LOCKED', 403, { detail: `account status is ${account.status}` });
    }
    if (account.emailVerifiedAt === null && !authRelaxed(this.env)) {
      throw new AppError('EMAIL_NOT_VERIFIED', 403, {
        detail: 'confirm your email before signing in',
      });
    }

    if (this.passwords.needsRehash(account.credential.passwordHash)) {
      await this.prisma.credential.update({
        where: { accountId: account.id },
        data: { passwordHash: await this.passwords.hash(input.password), params: ARGON2_PARAMS },
      });
    }

    const session = await this.sessions.create(account.id, ctx);
    const tokens = await this.accessTokens.issue(account.id, session.sessionId);
    await this.audit.record({
      actorAccountId: account.id,
      action: 'identity.session_created',
      targetType: 'session',
      targetId: session.sessionId,
      ...auditMeta(ctx),
    });
    return { tokens, user: toSessionUser(account), session };
  }

  async refresh(
    presentedToken: string,
    ctx: SessionContext,
  ): Promise<{ tokens: LoginResult['tokens']; session: IssuedSession }> {
    const session = await this.sessions.rotate(presentedToken, ctx);
    const tokens = await this.accessTokens.issue(session.accountId, session.sessionId);
    return { tokens, session };
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (presentedToken) await this.sessions.revokeByToken(presentedToken, 'logout');
  }

  /** Resolve the signed-in user from a refresh cookie without rotating anything. */
  async readSession(presentedToken: string | undefined): Promise<SessionUser> {
    if (!presentedToken) {
      throw new AppError('UNAUTHENTICATED', 401, { detail: 'no session cookie' });
    }
    const { accountId } = await this.sessions.resolveActive(presentedToken);
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'active') {
      throw new AppError('UNAUTHENTICATED', 401, { detail: 'account unavailable' });
    }
    return toSessionUser(account);
  }

  private verifyUrl(token: string): string {
    return `${this.env.APP_WEB_URL}/en/verify-email?token=${encodeURIComponent(token)}`;
  }

  private loginUrl(): string {
    return `${this.env.APP_WEB_URL}/en/login`;
  }
}

function toSessionUser(account: Account): SessionUser {
  return { id: account.id, email: account.email, emailVerified: account.emailVerifiedAt !== null };
}
