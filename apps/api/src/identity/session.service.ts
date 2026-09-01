import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  sessionId: string;
  accountId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Refresh-token sessions with rotation and reuse detection (plan/16 §1).
 * One row per issued token; a `family_id` links a rotation chain. Presenting a
 * token that was already rotated out revokes the whole family.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async create(accountId: string, ctx: SessionContext): Promise<IssuedSession> {
    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = this.refreshExpiry();
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        accountId,
        familyId: randomUUID(),
        refreshTokenHash: hashOpaqueToken(refreshToken),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        issuedAt: now,
        lastUsedAt: now,
        expiresAt: refreshExpiresAt,
      },
    });
    return { sessionId: session.id, accountId, refreshToken, refreshExpiresAt };
  }

  async rotate(presentedToken: string, ctx: SessionContext): Promise<IssuedSession> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashOpaqueToken(presentedToken) },
    });
    if (!session)
      throw new AppError('REFRESH_TOKEN_INVALID', 401, { detail: 'unknown refresh token' });

    if (session.revokedAt || session.replacedById) {
      await this.revokeFamily(session.familyId, 'reuse_detected');
      this.logger.warn(`refresh token reuse detected — revoked family ${session.familyId}`);
      throw new AppError('SESSION_REVOKED', 401, {
        detail: 'refresh token reuse detected; all sessions in this family revoked',
      });
    }
    if (session.expiresAt <= new Date()) {
      throw new AppError('REFRESH_TOKEN_INVALID', 401, { detail: 'refresh token expired' });
    }

    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = this.refreshExpiry();
    const now = new Date();

    const next = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          accountId: session.accountId,
          familyId: session.familyId,
          refreshTokenHash: hashOpaqueToken(refreshToken),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          issuedAt: now,
          lastUsedAt: now,
          expiresAt: refreshExpiresAt,
        },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          revokedAt: now,
          revokedReason: 'rotation',
          replacedById: created.id,
          lastUsedAt: now,
        },
      });
      return created;
    });

    return {
      sessionId: next.id,
      accountId: session.accountId,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async revokeByToken(
    presentedToken: string,
    reason: 'logout' | 'password_change' | 'admin' = 'logout',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashOpaqueToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeFamily(familyId: string, reason: 'reuse_detected' | 'admin'): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.env.AUTH_REFRESH_TTL_DAYS * 86_400_000);
  }
}
