import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ApiEnv } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActorService } from './actor.service.js';
import { JwksService } from '../crypto/jwks.service.js';
import { AccessTokenService, STAFF_AUDIENCE } from './access-token.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { AuditController } from './audit.controller.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

const env = {
  NODE_ENV: 'test',
  JWT_ISSUER: 'https://shopnetic.test',
  JWT_ACCESS_TTL_SECONDS: 900,
} as ApiEnv;

function contextWithBearer(token: string): ExecutionContext {
  const req = { headers: { authorization: `Bearer ${token}` } } as object as Request;
  // Minimal ExecutionContext stand-in — only the member the two guards touch.
  const mock = { switchToHttp: () => ({ getRequest: () => req }) };
  return mock as object as ExecutionContext;
}

describe.skipIf(!hasDb)('AuditController (integration)', () => {
  let prisma: PrismaClient;
  let controller: AuditController;
  let audit: AuditService;
  let actorId: string;
  let staffToken = '';
  let jwks: JwksService;
  const stamp = Date.now();
  const actorEmail = `itest-audit-actor-${stamp}@shopnetic.test`;
  const req = { headers: { 'x-request-id': 'itest-req-id' } } as object as Request;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const px = prisma as PrismaService;
    audit = new AuditService(px);
    controller = new AuditController(px);

    const actor = await prisma.account.create({
      data: { email: actorEmail, plane: 'staff', status: 'active', emailVerifiedAt: new Date() },
    });
    actorId = actor.id;

    // Shared across the whole describe block: with no JWT_PRIVATE_KEY/PUBLIC_KEY
    // configured, JwksService generates a fresh ephemeral keypair per instance —
    // a token minted here would fail verification against a *different*
    // instance's key, so the guard test below reuses this exact one.
    jwks = new JwksService(env);
    await jwks.onModuleInit();
    const accessTokens = new AccessTokenService(env, jwks);
    const { accessToken } = await accessTokens.issue(actorId, 'itest-session', STAFF_AUDIENCE);
    staffToken = accessToken;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actorId } });
    await prisma.account.delete({ where: { id: actorId } });
  });

  it('lists events newest-first with the actor email resolved and before/after preserved', async () => {
    await audit.record({
      actorAccountId: actorId,
      action: 'itest.audit_probe',
      targetType: 'account',
      targetId: actorId,
      before: { status: 'locked' },
      after: { status: 'active' },
    });

    const res = await controller.list(req, undefined, '5');
    const row = res.data.find((e) => e.action === 'itest.audit_probe');

    expect(row).toBeDefined();
    expect(row?.actorEmail).toBe(actorEmail);
    expect(row?.before).toEqual({ status: 'locked' });
    expect(row?.after).toEqual({ status: 'active' });
    expect(res.meta.requestId).toBe('itest-req-id');
  });

  it('paginates with a cursor — the second page never repeats the first', async () => {
    for (let i = 0; i < 3; i++) {
      await audit.record({ actorAccountId: actorId, action: `itest.audit_page_${i}` });
    }

    const first = await controller.list(req, undefined, '2');
    expect(first.data).toHaveLength(2);
    expect(first.meta.nextCursor).toBeDefined();

    const second = await controller.list(req, first.meta.nextCursor, '2');
    const firstIds = new Set(first.data.map((e) => e.id));
    expect(second.data.some((e) => firstIds.has(e.id))).toBe(false);
  });

  // Regression for "clicking Audit log signs the viewer out": a real admin
  // Bearer token must pass `StaffAuthGuard` (what the controller is actually
  // wired to) and must NOT pass the generic `AuthGuard` (storefront audience
  // only) — that mismatch is exactly the bug. A test that instantiates
  // `AuditController` directly and calls `.list()`, like the two above,
  // bypasses the guard pipeline entirely and can't catch this.
  it('a real admin token passes StaffAuthGuard but not the generic AuthGuard', async () => {
    const px = prisma as PrismaService;
    const actors = new ActorService(px);
    const staffGuard = new StaffAuthGuard(jwks, actors);
    const authGuard = new AuthGuard(jwks, actors);

    await expect(staffGuard.canActivate(contextWithBearer(staffToken))).resolves.toBe(true);
    await expect(authGuard.canActivate(contextWithBearer(staffToken))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('is wired to StaffAuthGuard, not the generic AuthGuard', () => {
    const guards = (Reflect.getMetadata('__guards__', AuditController) ?? []) as unknown[];
    expect(guards).toContain(StaffAuthGuard);
    expect(guards).not.toContain(AuthGuard);
  });
});
