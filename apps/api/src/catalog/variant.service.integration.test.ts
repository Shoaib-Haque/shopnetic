import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { CategoryOptionService } from './category-option.service.js';
import { ProductOptionService } from './product-option.service.js';
import { VariantService } from './variant.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('VariantService (integration)', () => {
  let prisma: PrismaClient;
  let optionTypes: OptionTypeService;
  let categoryOptions: CategoryOptionService;
  let productOptions: ProductOptionService;
  let variants: VariantService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-var-${stamp}-${x}`;
  const t = (en: string): Record<string, string> => ({ en: s(en) });

  let productId: string;
  let categoryId: string;
  let sizeTypeId: string;
  let sizeValues: Record<string, string> = {};
  let colorTypeId: string;
  let colorValues: Record<string, string> = {};

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    optionTypes = new OptionTypeService(pr, audit);
    categoryOptions = new CategoryOptionService(pr, audit);
    productOptions = new ProductOptionService(pr, audit);
    variants = new VariantService(pr, audit);

    const acc = await prisma.account.create({
      data: { email: `itest-var-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const cat = await prisma.category.create({
      data: { slug: s('apparel'), nameI18n: t('Apparel'), brandRequirement: 'none' },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
      cat.id.replace(/-/g, ''),
      cat.id,
    );
    categoryId = cat.id;

    // Create Size option type
    const size = await optionTypes.create(
      {
        code: s('size'),
        name: t('Size'),
        values: [
          { code: s('s'), label: t('Small') },
          { code: s('m'), label: t('Medium') },
        ],
      },
      actor,
      {},
    );
    sizeTypeId = size.id;
    sizeValues = Object.fromEntries(size.values.map((v) => [v.code.split('-').pop()!, v.id]));

    // Create Color option type
    const color = await optionTypes.create(
      {
        code: s('color'),
        name: t('Color'),
        values: [
          { code: s('red'), label: t('Red') },
          { code: s('blue'), label: t('Blue') },
        ],
      },
      actor,
      {},
    );
    colorTypeId = color.id;
    colorValues = Object.fromEntries(color.values.map((v) => [v.code.split('-').pop()!, v.id]));

    // Map Category Options as variant axes
    await categoryOptions.put(
      categoryId,
      sizeTypeId,
      { applicability: 'required', isVariantAxis: true, position: 0 },
      actor,
      {},
    );
    await categoryOptions.put(
      categoryId,
      colorTypeId,
      { applicability: 'required', isVariantAxis: true, position: 1 },
      actor,
      {},
    );

    // Create product
    const prod = await prisma.product.create({
      data: {
        slug: s('runner-tee'),
        categoryId,
        titleI18n: t('Runner Tee'),
        status: 'active',
      },
    });
    productId = prod.id;

    // Configure offered product option values
    await productOptions.put(productId, sizeTypeId, { position: 0 }, actor, {});
    await productOptions.setValues(
      productId,
      sizeTypeId,
      {
        values: [
          { optionValueId: sizeValues['s']!, position: 0 },
          { optionValueId: sizeValues['m']!, position: 1 },
        ],
      },
      actor,
      {},
    );

    await productOptions.put(productId, colorTypeId, { position: 1 }, actor, {});
    await productOptions.setValues(
      productId,
      colorTypeId,
      {
        values: [
          { optionValueId: colorValues['red']!, position: 0 },
          { optionValueId: colorValues['blue']!, position: 1 },
        ],
      },
      actor,
      {},
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const testProds = await prisma.product.findMany({
        where: { slug: { startsWith: `itest-var-${stamp}-` } },
        select: { id: true },
      });
      const prodIds = testProds.map((p) => p.id);

      if (prodIds.length > 0) {
        await prisma.variant.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.productOptionValue.deleteMany({
          where: { productOption: { productId: { in: prodIds } } },
        });
        await prisma.productOption.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
      }

      await prisma.categoryOption.deleteMany({
        where: { category: { slug: { startsWith: `itest-var-${stamp}-` } } },
      });

      await prisma.$executeRawUnsafe(
        `DELETE FROM catalog.category WHERE slug LIKE $1`,
        `itest-var-${stamp}-%`,
      );

      const testOpts = await prisma.optionType.findMany({
        where: { code: { startsWith: `itest-var-${stamp}-` } },
        select: { id: true },
      });
      const optIds = testOpts.map((o) => o.id);
      if (optIds.length > 0) {
        await prisma.optionValue.deleteMany({ where: { optionTypeId: { in: optIds } } });
        await prisma.optionType.deleteMany({ where: { id: { in: optIds } } });
      }

      if (actor?.accountId) {
        await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
        await prisma.account.deleteMany({ where: { id: actor.accountId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates a variant and denormalizes option type and value names on selections', async () => {
    const created = await variants.create(
      productId,
      {
        selections: [
          { optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! },
          { optionTypeId: colorTypeId, optionValueId: colorValues['red']! },
        ],
        skuCode: s('RUN-S-RED'),
        gtin: '123456789012',
        weightG: 180,
        dims: { length: 250, width: 200, height: 15 },
        status: 'active',
      },
      actor,
      {},
    );

    expect(created.id).toBeDefined();
    expect(created.productId).toBe(productId);
    expect(created.skuCode).toBe(s('RUN-S-RED'));
    expect(created.selections).toHaveLength(2);

    // Verify denormalized fields
    const sizeSel = created.selections.find((sel) => sel.optionTypeId === sizeTypeId);
    expect(sizeSel).toBeDefined();
    expect(sizeSel?.optionTypeCode).toBe(s('size'));
    expect(sizeSel?.optionTypeName?.en).toBe(s('Size'));
    expect(sizeSel?.optionValueCode).toBe(s('s'));
    expect(sizeSel?.optionValueLabel?.en).toBe(s('Small'));

    const colorSel = created.selections.find((sel) => sel.optionTypeId === colorTypeId);
    expect(colorSel).toBeDefined();
    expect(colorSel?.optionTypeCode).toBe(s('color'));
    expect(colorSel?.optionTypeName?.en).toBe(s('Color'));
    expect(colorSel?.optionValueCode).toBe(s('red'));
    expect(colorSel?.optionValueLabel?.en).toBe(s('Red'));
  });

  it('lists variants and gets a single variant with denormalized names intact', async () => {
    const list = await variants.list(productId);
    expect(list.length).toBeGreaterThan(0);

    const first = list[0]!;
    expect(first.selections).toHaveLength(2);
    expect(first.selections[0]?.optionTypeName?.en).toBeDefined();
    expect(first.selections[0]?.optionValueLabel?.en).toBeDefined();

    const fetched = await variants.get(first.id);
    expect(fetched.id).toBe(first.id);
    expect(fetched.selections).toEqual(first.selections);
  });

  it('resolves denormalized names even when the option type is archived', async () => {
    // Create variant with Medium and Blue
    const v = await variants.create(
      productId,
      {
        selections: [
          { optionTypeId: sizeTypeId, optionValueId: sizeValues['m']! },
          { optionTypeId: colorTypeId, optionValueId: colorValues['blue']! },
        ],
        skuCode: s('RUN-M-BLUE'),
      },
      actor,
      {},
    );

    // Soft-delete / archive the color option type
    await optionTypes.remove(colorTypeId, actor, {});

    // list() and get() should STILL resolve the optionTypeName and optionValueLabel cleanly
    const reloaded = await variants.get(v.id);
    const colorSel = reloaded.selections.find((sel) => sel.optionTypeId === colorTypeId);
    expect(colorSel).toBeDefined();
    expect(colorSel?.optionTypeName?.en).toBe(s('Color'));
    expect(colorSel?.optionValueLabel?.en).toBe(s('Blue'));
    expect(colorSel?.optionValueCode).toBe(s('blue'));

    // list() also preserves them
    const list = await variants.list(productId);
    const inList = list.find((item) => item.id === v.id);
    const inListColor = inList?.selections.find((sel) => sel.optionTypeId === colorTypeId);
    expect(inListColor?.optionTypeName?.en).toBe(s('Color'));
    expect(inListColor?.optionValueLabel?.en).toBe(s('Blue'));
  });

  it('updates variant metadata while preserving selections and denormalized fields', async () => {
    const list = await variants.list(productId);
    const target = list[0]!;

    const updated = await variants.update(
      target.id,
      {
        skuCode: s('RUN-UPDATED-SKU'),
        weightG: 220,
        status: 'inactive',
      },
      actor,
      {},
    );

    expect(updated.skuCode).toBe(s('RUN-UPDATED-SKU'));
    expect(updated.weightG).toBe(220);
    expect(updated.status).toBe('inactive');
    expect(updated.selections).toHaveLength(target.selections.length);
    expect(updated.selections[0]?.optionTypeName?.en).toBeDefined();
  });

  it('rejects duplicate variant combinations and invalid selections', async () => {
    await expect(
      variants.create(
        productId,
        {
          selections: [
            { optionTypeId: sizeTypeId, optionValueId: sizeValues['m']! },
            { optionTypeId: colorTypeId, optionValueId: colorValues['blue']! },
          ],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_COMBO_EXISTS' });

    await expect(
      variants.create(
        productId,
        {
          selections: [
            { optionTypeId: sizeTypeId, optionValueId: '00000000-0000-0000-0000-000000000000' },
          ],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_SELECTION_INVALID' });
  });

  it('soft-deletes a variant and excludes it from list', async () => {
    const listBefore = await variants.list(productId);
    const target = listBefore[0]!;

    await variants.remove(target.id, actor, {});

    const listAfter = await variants.list(productId);
    expect(listAfter.some((x) => x.id === target.id)).toBe(false);

    await expect(variants.get(target.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update rejects a stale expectedUpdatedAt (optimistic concurrency)', async () => {
    const list = await variants.list(productId);
    const target = list[0]!;

    await expect(
      variants.update(
        target.id,
        { skuCode: s('STALE-SKU'), expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const ok = await variants.update(
      target.id,
      { skuCode: s('FRESH-SKU'), expectedUpdatedAt: target.updatedAt },
      actor,
      {},
    );
    expect(ok.skuCode).toBe(s('FRESH-SKU'));
  });

  it('restores a soft-deleted variant and recovers it into list', async () => {
    const list = await variants.list(productId);
    const target = list[0]!;

    await variants.remove(target.id, actor, {});
    const listDeleted = await variants.list(productId);
    expect(listDeleted.some((x) => x.id === target.id)).toBe(false);

    const restored = await variants.restore(target.id, actor, {});
    expect(restored.id).toBe(target.id);

    const listRestored = await variants.list(productId);
    expect(listRestored.some((x) => x.id === target.id)).toBe(true);
  });

  it('throws VARIANT_ALREADY_ACTIVE when attempting to restore a live variant', async () => {
    const list = await variants.list(productId);
    const target = list[0]!;
    await expect(variants.restore(target.id, actor, {})).rejects.toMatchObject({
      code: 'VARIANT_ALREADY_ACTIVE',
      status: 409,
    });
  });

  it('throws PRODUCT_PARENT_ARCHIVED when restoring variant whose product is archived', async () => {
    const tempProd = await prisma.product.create({
      data: {
        categoryId,
        titleI18n: t('Temp Prod For Restore Test'),
        slug: s('temp-prod-archived-test'),
        status: 'draft',
      },
    });
    await productOptions.put(tempProd.id, sizeTypeId, { position: 0 }, actor, {});
    await productOptions.setValues(
      tempProd.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']!, position: 0 }] },
      actor,
      {},
    );
    const v = await variants.create(
      tempProd.id,
      {
        selections: [{ optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! }],
      },
      actor,
      {},
    );
    await variants.remove(v.id, actor, {});
    await prisma.product.update({
      where: { id: tempProd.id },
      data: { deletedAt: new Date() },
    });

    await expect(variants.restore(v.id, actor, {})).rejects.toMatchObject({
      code: 'PRODUCT_PARENT_ARCHIVED',
      status: 409,
    });
  });

  it('throws VARIANT_COMBO_EXISTS when restoring variant whose combo is taken by another live variant', async () => {
    const tempProd = await prisma.product.create({
      data: {
        categoryId,
        titleI18n: t('Temp Prod For Collision Test'),
        slug: s('temp-prod-collision-test'),
        status: 'draft',
      },
    });
    await productOptions.put(tempProd.id, sizeTypeId, { position: 0 }, actor, {});
    await productOptions.setValues(
      tempProd.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']!, position: 0 }] },
      actor,
      {},
    );
    const v1 = await variants.create(
      tempProd.id,
      {
        selections: [{ optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! }],
      },
      actor,
      {},
    );
    await variants.remove(v1.id, actor, {});

    const spy = vi
      .spyOn(prisma.variant, 'findFirst')
      .mockResolvedValueOnce({ id: 'existing-active-id' } as never);

    try {
      await expect(variants.restore(v1.id, actor, {})).rejects.toMatchObject({
        code: 'VARIANT_COMBO_EXISTS',
        status: 409,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('productOptions enforces optimistic concurrency control (expectedUpdatedAt)', async () => {
    const options = await productOptions.list(productId);
    const sizeOpt = options.find((o) => o.optionTypeId === sizeTypeId)!;
    expect(sizeOpt.updatedAt).toBeDefined();

    await expect(
      productOptions.put(
        productId,
        sizeTypeId,
        { position: 5, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      productOptions.setValues(
        productId,
        sizeTypeId,
        {
          values: [{ optionValueId: sizeValues['s']!, position: 0 }],
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const ok = await productOptions.put(
      productId,
      sizeTypeId,
      { position: 0, expectedUpdatedAt: sizeOpt.updatedAt },
      actor,
      {},
    );
    expect(ok.position).toBe(0);
  });

  it('allows listing options and variants on an archived product, but rejects creating new ones', async () => {
    const archivedProd = await prisma.product.create({
      data: {
        categoryId,
        titleI18n: { en: 'Archived Product For Test' },
        slug: s('archived-prod-list'),
        status: 'archived',
        deletedAt: new Date(),
      },
    });

    try {
      const opts = await productOptions.list(archivedProd.id);
      expect(opts).toEqual([]);

      const vars = await variants.list(archivedProd.id);
      expect(vars).toEqual([]);

      await expect(
        productOptions.put(archivedProd.id, sizeTypeId, { position: 0 }, actor, {}),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });

      await expect(
        variants.create(
          archivedProd.id,
          {
            selections: [{ optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! }],
          },
          actor,
          {},
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    } finally {
      await prisma.product.delete({ where: { id: archivedProd.id } });
    }
  });
});
