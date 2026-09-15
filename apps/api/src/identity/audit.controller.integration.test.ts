import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditController } from './audit.controller.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('AuditController (integration)', () => {
  let prisma: PrismaClient;
  let controller: AuditController;
  let audit: AuditService;
  let actorId: string;
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
});
