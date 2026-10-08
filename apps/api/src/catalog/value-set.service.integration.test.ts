import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { ValueSetService } from './value-set.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('ValueSetService (integration)', () => {
  let prisma: PrismaClient;
  let svc: ValueSetService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-vs-${stamp}-${x}`;

  let optionTypeAId: string;
  let optionTypeBId: string;
  let valA1Id: string;
  let valA2Id: string;
  let valA3Id: string;
  let valB1Id: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    svc = new ValueSetService(prisma as PrismaService, new AuditService(prisma as PrismaService));
    const acc = await prisma.account.create({
      data: { email: `itest-vs-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    // Create two option types with values
    const otA = await prisma.optionType.create({
      data: {
        code: s('type-a'),
        nameI18n: { en: 'Type A' },
        values: {
          create: [
            { code: s('a1'), labelI18n: { en: 'A1' }, position: 0 },
            { code: s('a2'), labelI18n: { en: 'A2' }, position: 1 },
            { code: s('a3'), labelI18n: { en: 'A3' }, position: 2 },
          ],
        },
      },
      include: { values: true },
    });
    optionTypeAId = otA.id;
    valA1Id = otA.values.find((v) => v.code === s('a1'))!.id;
    valA2Id = otA.values.find((v) => v.code === s('a2'))!.id;
    valA3Id = otA.values.find((v) => v.code === s('a3'))!.id;

    const otB = await prisma.optionType.create({
      data: {
        code: s('type-b'),
        nameI18n: { en: 'Type B' },
        values: {
          create: [{ code: s('b1'), labelI18n: { en: 'B1' }, position: 0 }],
        },
      },
      include: { values: true },
    });
    optionTypeBId = otB.id;
    valB1Id = otB.values.find((v) => v.code === s('b1'))!.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const vsIds = (
      await prisma.valueSet.findMany({ where: { name: { startsWith: `itest-vs-${stamp}-` } } })
    ).map((v) => v.id);

    await prisma.valueSetItem.deleteMany({ where: { valueSetId: { in: vsIds } } });
    await prisma.categoryOption.deleteMany({ where: { valueSetId: { in: vsIds } } });
    await prisma.valueSet.deleteMany({ where: { id: { in: vsIds } } });

    await prisma.optionValue.deleteMany({
      where: { optionTypeId: { in: [optionTypeAId, optionTypeBId] } },
    });
    await prisma.optionType.deleteMany({
      where: { id: { in: [optionTypeAId, optionTypeBId] } },
    });

    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates a value set with homogeneous values and tracks optionTypeId', async () => {
    const vs = await svc.create(
      {
        name: s('Sizes Small'),
        optionTypeId: optionTypeAId,
        items: [
          { optionValueId: valA1Id, position: 0 },
          { optionValueId: valA2Id, position: 1 },
        ],
      },
      actor,
      {},
    );
    expect(vs.name).toBe(s('Sizes Small'));
    expect(vs.optionTypeId).toBe(optionTypeAId);
    expect(vs.items).toHaveLength(2);
    expect(vs.items[0]?.optionValueId).toBe(valA1Id);
    expect(vs.items[1]?.optionValueId).toBe(valA2Id);
    expect(vs.deletedAt).toBeNull();
  });

  it('rejects creation if any item belongs to a different option type (mixed-type guard)', async () => {
    await expect(
      svc.create(
        {
          name: s('Mixed Set'),
          optionTypeId: optionTypeAId,
          items: [
            { optionValueId: valA1Id, position: 0 },
            { optionValueId: valB1Id, position: 1 },
          ],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({
      code: 'VALUE_SET_TYPE_MISMATCH',
      status: 422,
    });
  });

  it('rejects adding an item from a different option type', async () => {
    const vs = await svc.create(
      {
        name: s('Strict Type Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );

    await expect(svc.addItem(vs.id, { optionValueId: valB1Id }, actor, {})).rejects.toMatchObject({
      code: 'VALUE_SET_TYPE_MISMATCH',
      status: 422,
    });
  });

  it('enforces case-insensitive name uniqueness among live records', async () => {
    await svc.create(
      {
        name: s('Unique Name'),
        optionTypeId: optionTypeAId,
        items: [],
      },
      actor,
      {},
    );

    await expect(
      svc.create(
        {
          name: s('unique name'), // lower case clash
          optionTypeId: optionTypeAId,
          items: [],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({
      code: 'VALUE_SET_NAME_TAKEN',
      status: 409,
    });
  });

  it('enforces optimistic concurrency control on update (expectedUpdatedAt)', async () => {
    const vs = await svc.create(
      {
        name: s('Concurrent Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );

    // Update 1 succeeds with current token
    const updated1 = await svc.update(
      vs.id,
      { name: s('Concurrent Set v1'), expectedUpdatedAt: vs.updatedAt },
      actor,
      {},
    );
    expect(updated1.name).toBe(s('Concurrent Set v1'));

    // Update 2 with old token fails with 409 CONFLICT
    await expect(
      svc.update(
        vs.id,
        { name: s('Concurrent Set v2'), expectedUpdatedAt: vs.updatedAt },
        actor,
        {},
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });

    // Update 3 succeeds with fresh token
    const updated3 = await svc.update(
      vs.id,
      { name: s('Concurrent Set v3'), expectedUpdatedAt: updated1.updatedAt },
      actor,
      {},
    );
    expect(updated3.name).toBe(s('Concurrent Set v3'));
  });

  it('touches parent updatedAt on addItem, removeItem, and reorderItems', async () => {
    const vs = await svc.create(
      {
        name: s('Touch Timestamp Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );
    const t0 = vs.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 20));
    const afterAdd = await svc.addItem(vs.id, { optionValueId: valA2Id }, actor, {});
    expect(new Date(afterAdd.updatedAt).getTime()).toBeGreaterThan(new Date(t0).getTime());

    await new Promise((r) => setTimeout(r, 20));
    await svc.removeItem(vs.id, valA2Id, actor, {});
    const afterRemove = await svc.get(vs.id);
    expect(new Date(afterRemove.updatedAt).getTime()).toBeGreaterThan(
      new Date(afterAdd.updatedAt).getTime(),
    );

    await svc.addItem(vs.id, { optionValueId: valA2Id }, actor, {});
    const beforeReorder = await svc.get(vs.id);

    await new Promise((r) => setTimeout(r, 20));
    const afterReorder = await svc.reorderItems(
      vs.id,
      { orderedOptionValueIds: [valA2Id, valA1Id] },
      actor,
      {},
    );
    expect(new Date(afterReorder.updatedAt).getTime()).toBeGreaterThan(
      new Date(beforeReorder.updatedAt).getTime(),
    );
    expect(afterReorder.items[0]?.optionValueId).toBe(valA2Id);
    expect(afterReorder.items[1]?.optionValueId).toBe(valA1Id);
  });

  it('reorders items and rejects incomplete or invalid id lists', async () => {
    const vs = await svc.create(
      {
        name: s('Reorder Set'),
        optionTypeId: optionTypeAId,
        items: [
          { optionValueId: valA1Id, position: 0 },
          { optionValueId: valA2Id, position: 1 },
          { optionValueId: valA3Id, position: 2 },
        ],
      },
      actor,
      {},
    );

    // Valid reorder
    const reordered = await svc.reorderItems(
      vs.id,
      { orderedOptionValueIds: [valA3Id, valA1Id, valA2Id] },
      actor,
      {},
    );
    expect(reordered.items.map((i) => i.optionValueId)).toEqual([valA3Id, valA1Id, valA2Id]);
    expect(reordered.items.map((i) => i.position)).toEqual([0, 1, 2]);

    // Incomplete list rejected
    await expect(
      svc.reorderItems(vs.id, { orderedOptionValueIds: [valA1Id, valA2Id] }, actor, {}),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });

    // Duplicate list rejected
    await expect(
      svc.reorderItems(vs.id, { orderedOptionValueIds: [valA1Id, valA1Id, valA2Id] }, actor, {}),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  });

  it('soft-deletes (archives) a value set and protects it from mutation while archived', async () => {
    const vs = await svc.create(
      {
        name: s('Archive Test Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );

    await svc.remove(vs.id, actor, {});
    const archived = await svc.get(vs.id);
    expect(archived.deletedAt).not.toBeNull();

    // Mutations on archived set are blocked with VALUE_SET_ARCHIVED
    await expect(svc.update(vs.id, { name: s('Cannot Edit') }, actor, {})).rejects.toMatchObject({
      code: 'VALUE_SET_ARCHIVED',
      status: 409,
    });

    await expect(svc.addItem(vs.id, { optionValueId: valA2Id }, actor, {})).rejects.toMatchObject({
      code: 'VALUE_SET_ARCHIVED',
      status: 409,
    });
  });

  it('blocks soft-deleting a value set referenced by a category option (VALUE_SET_IN_USE)', async () => {
    const vs = await svc.create(
      {
        name: s('In-Use Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );

    // Create temporary category
    const cat = await prisma.category.create({
      data: {
        slug: s('cat-vs-use'),
        nameI18n: { en: 'Cat VS' },
      },
    });

    // Wire category option referencing this value set
    await prisma.categoryOption.create({
      data: {
        categoryId: cat.id,
        optionTypeId: optionTypeAId,
        valueSource: 'predefined',
        valueSetId: vs.id,
      },
    });

    try {
      await expect(svc.remove(vs.id, actor, {})).rejects.toMatchObject({
        code: 'VALUE_SET_IN_USE',
        status: 409,
      });
    } finally {
      await prisma.categoryOption.deleteMany({ where: { categoryId: cat.id } });
      await prisma.category.deleteMany({ where: { id: cat.id } });
    }
  });

  it('restores an archived value set and checks parent option type status', async () => {
    const vs = await svc.create(
      {
        name: s('Restore Set'),
        optionTypeId: optionTypeAId,
        items: [{ optionValueId: valA1Id, position: 0 }],
      },
      actor,
      {},
    );

    await svc.remove(vs.id, actor, {});
    const restored = await svc.restore(vs.id, actor, {});
    expect(restored.deletedAt).toBeNull();
  });

  it('rejects restoring a value set if its parent option type is archived (OPTION_TYPE_ARCHIVED)', async () => {
    // Create dedicated option type
    const tempOt = await prisma.optionType.create({
      data: {
        code: s('archived-parent-ot'),
        nameI18n: { en: 'Temp Parent' },
      },
    });

    const vs = await svc.create(
      {
        name: s('Set With Doomed Parent'),
        optionTypeId: tempOt.id,
        items: [],
      },
      actor,
      {},
    );

    // Archive both value set and option type
    await svc.remove(vs.id, actor, {});
    await prisma.optionType.update({
      where: { id: tempOt.id },
      data: { deletedAt: new Date() },
    });

    try {
      await expect(svc.restore(vs.id, actor, {})).rejects.toMatchObject({
        code: 'OPTION_TYPE_ARCHIVED',
        status: 409,
      });
    } finally {
      await prisma.valueSet.deleteMany({ where: { id: vs.id } });
      await prisma.optionType.deleteMany({ where: { id: tempOt.id } });
    }
  });

  it('filters value sets by status (active, archived, all) and optionTypeId', async () => {
    const activeSet = await svc.create(
      {
        name: s('Filter Active'),
        optionTypeId: optionTypeAId,
        items: [],
      },
      actor,
      {},
    );

    const archivedSet = await svc.create(
      {
        name: s('Filter Archived'),
        optionTypeId: optionTypeAId,
        items: [],
      },
      actor,
      {},
    );
    await svc.remove(archivedSet.id, actor, {});

    const activeList = await svc.list({ status: 'active', optionTypeId: optionTypeAId });
    expect(activeList.some((v) => v.id === activeSet.id)).toBe(true);
    expect(activeList.some((v) => v.id === archivedSet.id)).toBe(false);

    const archivedList = await svc.list({ status: 'archived', optionTypeId: optionTypeAId });
    expect(archivedList.some((v) => v.id === activeSet.id)).toBe(false);
    expect(archivedList.some((v) => v.id === archivedSet.id)).toBe(true);

    const allList = await svc.list({ status: 'all', optionTypeId: optionTypeAId });
    expect(allList.some((v) => v.id === activeSet.id)).toBe(true);
    expect(allList.some((v) => v.id === archivedSet.id)).toBe(true);
  });
});
