import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

const name = (en: string): Record<string, string> => ({ en });

describe.skipIf(!hasDb)('OptionTypeService (integration)', () => {
  let prisma: PrismaClient;
  let svc: OptionTypeService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-opt-${stamp}-${x}`;

  beforeAll(async () => {
    prisma = getPrismaClient();
    svc = new OptionTypeService(prisma as PrismaService, new AuditService(prisma as PrismaService));
    const acc = await prisma.account.create({
      data: { email: `itest-opt-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = (
      await prisma.optionType.findMany({ where: { code: { startsWith: `itest-opt-${stamp}-` } } })
    ).map((t) => t.id);
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type = 'option_type' AND aggregate_id = ANY($1::text[])`,
      ids,
    );
    await prisma.optionValue.deleteMany({ where: { optionTypeId: { in: ids } } });
    await prisma.optionType.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates an option type with nested values (de-duped, positioned)', async () => {
    const t = await svc.create(
      {
        code: s('color'),
        name: name('Color'),
        dataType: 'swatch',
        hasSwatch: true,
        // hex is normalised to lowercase by the contract schema; the service
        // trusts its validated input, so pass it already-normalised here.
        values: [
          { code: s('red'), label: name('Red'), swatchHex: '#ff0000' },
          { code: s('blue'), label: name('Blue'), swatchHex: '#0000ff' },
          { code: s('red'), label: name('Red again') },
        ],
      },
      actor,
      {},
    );
    expect(t.dataType).toBe('swatch');
    expect(t.values.map((v) => v.code)).toEqual([s('red'), s('blue')]);
    expect(t.values[0]?.swatchHex).toBe('#ff0000');
    expect(t.values.map((v) => v.position)).toEqual([0, 1]);
  });

  it('rejects a duplicate type code and a duplicate value code within a type', async () => {
    await svc.create({ code: s('size'), name: name('Size') }, actor, {});
    await expect(
      svc.create({ code: s('size'), name: name('Size 2') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_TYPE_CODE_TAKEN' });

    const t = await svc.create(
      {
        code: s('storage'),
        name: name('Storage'),
        values: [{ code: s('128'), label: name('128GB') }],
      },
      actor,
      {},
    );
    await expect(
      svc.addValue(t.id, { code: s('128'), label: name('128 GB') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_CODE_TAKEN' });

    // same value code under a different type is fine
    const t2 = await svc.create({ code: s('capacity'), name: name('Capacity') }, actor, {});
    await expect(
      svc.addValue(t2.id, { code: s('128'), label: name('128') }, actor, {}),
    ).resolves.toMatchObject({ id: t2.id });
  });

  it('adds, updates (deprecate) and removes a value', async () => {
    const t = await svc.create({ code: s('carrier'), name: name('Carrier') }, actor, {});
    const withV = await svc.addValue(
      t.id,
      { code: s('verizon'), label: name('Verizon') },
      actor,
      {},
    );
    const vid = withV.values.find((v) => v.code === s('verizon'))?.id ?? '';

    const deprecated = await svc.updateValue(t.id, vid, { status: 'deprecated' }, actor, {});
    expect(deprecated.values.find((v) => v.id === vid)?.status).toBe('deprecated');

    await svc.removeValue(t.id, vid, actor, {});
    const after = await svc.get(t.id);
    expect(after.values).toHaveLength(0);
    await expect(svc.removeValue(t.id, vid, actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('soft-deletes a type: gone from get + default list, kept with includeDeleted', async () => {
    const t = await svc.create({ code: s('grade'), name: name('Grade') }, actor, {});
    await svc.remove(t.id, actor, {});
    await expect(svc.get(t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const listed = await svc.list({ q: s('grade') });
    expect(listed).toHaveLength(0);
    const all = await svc.list({ q: s('grade'), includeDeleted: true });
    expect(all.map((x) => x.id)).toContain(t.id);
  });

  it('writes a catalog.outbox row per mutation', async () => {
    const t = await svc.create({ code: s('obx'), name: name('O') }, actor, {});
    await svc.update(t.id, { hasSwatch: true }, actor, {});
    await svc.addValue(t.id, { code: s('x'), label: name('X') }, actor, {});
    const rows = await prisma.catalogOutbox.findMany({ where: { aggregateId: t.id } });
    expect(rows.map((r) => r.eventType).sort()).toEqual([
      'option_type.created',
      'option_type.updated',
      'option_type.updated',
    ]);
  });
});
