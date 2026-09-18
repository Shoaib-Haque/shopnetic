import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Session } from '@shopnetic/db';
import type { StaffSession } from '@shopnetic/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { clampLimit, paginate } from '../common/pagination.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';
import { parseUserAgent } from './user-agent.js';
import type { RequestMeta } from './identity.service.js';

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

type SessionWithAccountEmail = Session & { account: { email: string } };

function toStaffSession(row: SessionWithAccountEmail, currentSessionId?: string): StaffSession {
  const { browser, os, deviceLabel } = parseUserAgent(row.userAgent);
  return {
    id: row.id,
    accountId: row.accountId,
    accountEmail: row.account.email,
    ip: row.ip,
    browser,
    os,
    deviceLabel,
    issuedAt: row.issuedAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    isCurrent: row.id === currentSessionId,
  };
}

export interface SessionContext {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface IssuedSession {
  sessionId: string;
  accountId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Refresh-token sessions with rotation and reuse detection (plan/16 section 1).
 * One row per issued token; a `family_id` links a rotation chain. Presenting a
 * token that was already rotated out revokes the whole family.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly audit: AuditService,
  ) {}

  /** `refreshTtlMs` overrides the default (buyer) 30-day lifetime — staff pass 8h. */
  async create(
    accountId: string,
    ctx: SessionContext,
    refreshTtlMs: number = this.defaultRefreshTtlMs(),
  ): Promise<IssuedSession> {
    const refreshToken = generateOpaqueToken();
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs);
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
      await this.audit.record({
        actorAccountId: session.accountId,
        action: 'identity.token_reuse_detected',
        targetType: 'session_family',
        targetId: session.familyId,
        reason: 'rotated-out refresh token was presented again',
        ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      });
      throw new AppError('SESSION_REVOKED', 401, {
        detail: 'refresh token reuse detected; all sessions in this family revoked',
      });
    }
    if (session.expiresAt <= new Date()) {
      throw new AppError('REFRESH_TOKEN_INVALID', 401, { detail: 'refresh token expired' });
    }

    const refreshToken = generateOpaqueToken();
    const now = new Date();
    // Preserve the session family's lifetime kind (buyer 30d vs staff 8h).
    const lifetimeMs = session.expiresAt.getTime() - session.issuedAt.getTime();
    const refreshExpiresAt = new Date(now.getTime() + lifetimeMs);

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

  /** Read-only: returns the account for a still-valid refresh token, else throws. */
  async resolveActive(presentedToken: string): Promise<{ accountId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashOpaqueToken(presentedToken) },
    });
    if (!session || session.revokedAt || session.replacedById || session.expiresAt <= new Date()) {
      throw new AppError('UNAUTHENTICATED', 401, { detail: 'no active session' });
    }
    return { accountId: session.accountId };
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

  /** A single named session, by id — the "log out this one device" action.
   * `revokeByToken` above needs the raw refresh token; an admin (self or
   * managing someone else) only ever has the opaque session id a list
   * response handed back, never the token itself. `scopeAccountId` is
   * required by every caller in this feature (never omitted) — without it, a
   * session id that happens to belong to a *different* account than the one
   * the caller is authorized for would still get revoked; scoping the
   * `WHERE` to it makes a mismatched id a safe no-op instead. */
  async revokeById(
    sessionId: string,
    scopeAccountId: string,
    reason: 'logout' | 'admin' = 'logout',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, accountId: scopeAccountId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Every still-active session for an account — deprovisioning, a forced
   * password reset, "log out all other devices", etc. `ActorService` already
   * blocks a non-`active` account on its very next request regardless, so
   * this is belt-and-suspenders: it makes the account look signed-out
   * immediately rather than merely refuse to do anything the next time it
   * tries. `exceptSessionId` is for the self-service "log out everywhere
   * else" case — bulk-revoking your *own* current session mid-request would
   * lock you out of the very action you just took; there's no equivalent
   * exception when an admin bulk-revokes *someone else's* sessions, since
   * none of them can be the admin's own current one. */
  async revokeAllForAccount(
    accountId: string,
    reason: 'admin' | 'password_change' | 'logout',
    exceptSessionId?: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        accountId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** One account's still-valid sessions — the self-service "my devices" view,
   * and the same query an admin viewing another staff member's sessions
   * uses. Ordered `id desc` (UUIDv7, so newest-issued/rotated first) —
   * mirrors `StaffAccountsService.list()`'s own reasoning for using `id` as
   * the keyset-pagination cursor field: stable and unique, unlike
   * `lastUsedAt` which can tie or (per the schema) be null. */
  async listForAccount(
    accountId: string,
    opts: { cursor?: string; limit?: number; currentSessionId?: string } = {},
  ): Promise<{ sessions: StaffSession[]; nextCursor?: string }> {
    const take = clampLimit(opts.limit ?? DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const rows = await this.prisma.session.findMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { account: { select: { email: true } } },
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const { page, nextCursor } = paginate(rows, take);
    return {
      sessions: page.map((r) => toStaffSession(r, opts.currentSessionId)),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  /** Every staff account's still-valid sessions, flattened — the Super
   * Admin-only "All sessions" tab. No `currentSessionId`: the viewer's own
   * current session is never *someone else's* row, so nothing here can ever
   * be "current" the way `listForAccount` above means it. */
  async listAll(
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ sessions: StaffSession[]; nextCursor?: string }> {
    const take = clampLimit(opts.limit ?? DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const rows = await this.prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, account: { plane: 'staff' } },
      include: { account: { select: { email: true } } },
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const { page, nextCursor } = paginate(rows, take);
    return { sessions: page.map((r) => toStaffSession(r)), ...(nextCursor ? { nextCursor } : {}) };
  }

  /** Self-service: log out exactly one of the caller's own devices. Every
   * other staff-lifecycle self-action (`changePassword`, …) is audited the
   * same way — `actorAccountId` is the account acting on itself. */
  async revokeOwnSession(
    accountId: string,
    sessionId: string,
    meta: RequestMeta = {},
  ): Promise<void> {
    await this.revokeById(sessionId, accountId, 'logout');
    await this.audit.record({
      actorAccountId: accountId,
      action: 'identity.staff_session_revoked',
      targetType: 'account',
      targetId: accountId,
      after: { sessionId },
      ...pick(meta),
    });
  }

  /** Self-service: "log out everywhere else" — every session but the one
   * making this request. */
  async revokeOwnOtherSessions(
    accountId: string,
    currentSessionId: string,
    meta: RequestMeta = {},
  ): Promise<void> {
    await this.revokeAllForAccount(accountId, 'logout', currentSessionId);
    await this.audit.record({
      actorAccountId: accountId,
      action: 'identity.staff_sessions_revoked_all',
      targetType: 'account',
      targetId: accountId,
      after: { exceptCurrent: true },
      ...pick(meta),
    });
  }

  private async revokeFamily(familyId: string, reason: 'reuse_detected' | 'admin'): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private defaultRefreshTtlMs(): number {
    return this.env.AUTH_REFRESH_TTL_DAYS * 86_400_000;
  }
}
