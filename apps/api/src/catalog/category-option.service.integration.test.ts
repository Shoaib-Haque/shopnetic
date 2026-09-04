import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { ValueSetService } from './value-set.service.js';
import { CategoryOptionService } from './category-option.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const name = (en: string): Record<string, string> => ({ en });

describe.skipIf(!hasDb)('ValueSet + CategoryOption (integration)', () => {
  let prisma: PrismaClient;
  let optionTypes: OptionTypeService;
  let valueSets: ValueSetService;
  let categoryOptions: CategoryOptionService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-co-${stamp}-${x}`;

  // shared fixtures
  let sizeTypeId: string;
  let sizeValueIds: string[] = [];
  let colorTypeId: string;
  let colorValueId: string;
  let categoryId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    optionTypes = new OptionTypeService(pr, audit);
    valueSets = new ValueSetService(pr, audit);
    categoryOptions = new CategoryOptionService(pr, audit);

    const acc = await prisma.account.create({
      data: { email: `itest-co-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const size = await optionTypes.create(
      {
        code: s('size'),
        name: name('Size'),
        values: [
          { code: s('s'), label: name('S') },
          { code: s('m'), label: name('M') },
          { code: s('l'), label: name('L') },
        ],
      },
      actor,
      {},
    );
    sizeTypeId = size.id;
    sizeValueIds = size.values.map((v) => v.id);

    const color = await optionTypes.create(
      { code: s('color'), name: name('Color'), values: [{ code: s('red'), label: name('Red') }] },
      actor,
      {},
    );
    colorTypeId = color.id;
    colorValueId = color.values[0]?.id ?? '';

    const cat = await prisma.category.create({
      data: { slug: s('apparel'), nameI18n: name('Apparel') },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
      cat.id.replace(/-/g, ''),
      cat.id,
    );
    categoryId = cat.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type IN ('option_type','value_set','category_option')
         AND (aggregate_id LIKE $1 OR aggregate_id IN (SELECT id::text FROM catalog.option_type WHERE code LIKE $2))`,
      `${categoryId}%`,
      `itest-co-${stamp}-%`,
    );
    await prisma.categoryOption.deleteMany({ where: { categoryId } });
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.category WHERE slug LIKE $1`,
      `itest-co-${stamp}-%`,
    );
    await prisma.valueSet.deleteMany({ where: { name: { startsWith: `itest-co-${stamp}-` } } });
    await prisma.optionType.deleteMany({ where: { code: { startsWith: `itest-co-${stamp}-` } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates a value set with items resolved to their option type', async () => {
    const vs = await valueSets.create(
      {
        name: s('apparel-sizes'),
        items: [
          { optionValueId: sizeValueIds[0]!, position: 0 },
          { optionValueId: sizeValueIds[1]!, position: 1 },
          { optionValueId: sizeValueIds[0]! }, // dup → dropped
        ],
      },
      actor,
      {},
    );
    expect(vs.items).toHaveLength(2);
    expect(vs.items.every((i) => i.optionTypeId === sizeTypeId)).toBe(true);

    await expect(valueSets.create({ name: s('apparel-sizes') }, actor, {})).rejects.toMatchObject({
      code: 'VALUE_SET_NAME_TAKEN',
    });
  });

  it('adds and removes value set items; rejects a duplicate', async () => {
    const vs = await valueSets.create({ name: s('sizes-2') }, actor, {});
    const withItem = await valueSets.addItem(vs.id, { optionValueId: sizeValueIds[2]! }, actor, {});
    expect(withItem.items.map((i) => i.optionValueId)).toContain(sizeValueIds[2]);
    await expect(
      valueSets.addItem(vs.id, { optionValueId: sizeValueIds[2]! }, actor, {}),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await valueSets.removeItem(vs.id, sizeValueIds[2]!, actor, {});
    expect((await valueSets.get(vs.id)).items).toHaveLength(0);
  });

  it('put creates with model defaults, then updates in place', async () => {
    const created = await categoryOptions.put(categoryId, sizeTypeId, {}, actor, {});
    expect(created).toMatchObject({
      applicability: 'optional',
      isVariantAxis: true,
      valueSource: 'open',
      valueSetId: null,
      priceImpact: false,
      optionTypeCode: s('size'),
    });

    const updated = await categoryOptions.put(
      categoryId,
      sizeTypeId,
      { applicability: 'required', position: 3, priceImpact: true },
      actor,
      {},
    );
    expect(updated).toMatchObject({ applicability: 'required', position: 3, priceImpact: true });

    const list = await categoryOptions.list(categoryId);
    expect(list.map((r) => r.optionTypeId)).toContain(sizeTypeId);
  });

  it('enforces value-source ↔ value-set rules and type consistency', async () => {
    // predefined needs a set
    await expect(
      categoryOptions.put(categoryId, colorTypeId, { valueSource: 'predefined' }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_OPTION_INVALID' });

    // a set of Size values cannot back a Color option
    const sizeSet = await valueSets.create(
      { name: s('sizes-3'), items: [{ optionValueId: sizeValueIds[0]! }] },
      actor,
      {},
    );
    await expect(
      categoryOptions.put(
        categoryId,
        colorTypeId,
        { valueSource: 'predefined', valueSetId: sizeSet.id },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VALUE_SET_TYPE_MISMATCH' });

    // a matching set works
    const colorSet = await valueSets.create(
      { name: s('colors'), items: [{ optionValueId: colorValueId }] },
      actor,
      {},
    );
    const okRow = await categoryOptions.put(
      categoryId,
      colorTypeId,
      { valueSource: 'hybrid', valueSetId: colorSet.id },
      actor,
      {},
    );
    expect(okRow).toMatchObject({ valueSource: 'hybrid', valueSetId: colorSet.id });

    // 'open' must not carry a set
    await expect(
      categoryOptions.put(categoryId, colorTypeId, { valueSource: 'open' }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_OPTION_INVALID' });

    // …and the set it now uses can't be deleted
    await expect(valueSets.remove(colorSet.id, actor, {})).rejects.toMatchObject({
      code: 'VALUE_SET_IN_USE',
    });
  });

  it('removes a category option and 404s on a second remove', async () => {
    await categoryOptions.put(categoryId, sizeTypeId, {}, actor, {});
    await categoryOptions.remove(categoryId, sizeTypeId, actor, {});
    await expect(categoryOptions.remove(categoryId, sizeTypeId, actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('writes catalog.outbox rows for the config changes', async () => {
    const rows = await prisma.catalogOutbox.findMany({
      where: { aggregateId: `${categoryId}:${sizeTypeId}` },
    });
    const types = rows.map((r) => r.eventType);
    expect(types).toContain('category_option.set');
    expect(types).toContain('category_option.removed');
  });
});
