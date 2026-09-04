import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { CategoryOptionService } from './category-option.service.js';
import { ProductService } from './product.service.js';
import { ProductOptionService } from './product-option.service.js';
import { VariantService } from './variant.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const t = (en: string): Record<string, string> => ({ en });

describe.skipIf(!hasDb)('Product / ProductOption / Variant (integration)', () => {
  let prisma: PrismaClient;
  let products: ProductService;
  let productOptions: ProductOptionService;
  let variants: VariantService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-pr-${stamp}-${x}`;

  let catOptionalId: string;
  let catNoneId: string;
  let brandId: string;
  let sizeTypeId: string;
  let sizeValues: Record<string, string> = {};
  let colorTypeId: string;
  let colorValues: Record<string, string> = {};
  let materialTypeId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    const optionTypes = new OptionTypeService(pr, audit);
    const categoryOptions = new CategoryOptionService(pr, audit);
    products = new ProductService(pr, audit);
    productOptions = new ProductOptionService(pr, audit);
    variants = new VariantService(pr, audit);

    const acc = await prisma.account.create({
      data: { email: `itest-pr-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const mkCat = async (slug: string, req: 'optional' | 'none'): Promise<string> => {
      const c = await prisma.category.create({
        data: { slug, nameI18n: t(slug), brandRequirement: req },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
        c.id.replace(/-/g, ''),
        c.id,
      );
      return c.id;
    };
    catOptionalId = await mkCat(s('apparel'), 'optional');
    catNoneId = await mkCat(s('generic'), 'none');

    const brand = await prisma.brand.create({ data: { name: s('Acme'), slug: s('acme') } });
    brandId = brand.id;

    const size = await optionTypes.create(
      {
        code: s('size'),
        name: t('Size'),
        values: [
          { code: s('s'), label: t('S') },
          { code: s('m'), label: t('M') },
          { code: s('l'), label: t('L') },
        ],
      },
      actor,
      {},
    );
    sizeTypeId = size.id;
    sizeValues = Object.fromEntries(size.values.map((v) => [v.code.split('-').pop()!, v.id]));

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

    const material = await optionTypes.create(
      { code: s('material'), name: t('Material') },
      actor,
      {},
    );
    materialTypeId = material.id;

    for (const otId of [sizeTypeId, colorTypeId]) {
      await categoryOptions.put(
        catOptionalId,
        otId,
        { applicability: 'optional', isVariantAxis: true, valueSource: 'open' },
        actor,
        {},
      );
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    const cats = [catOptionalId, catNoneId];
    const prodIds = (await prisma.product.findMany({ where: { categoryId: { in: cats } } })).map(
      (p) => p.id,
    );
    const varIds = (await prisma.variant.findMany({ where: { productId: { in: prodIds } } })).map(
      (v) => v.id,
    );
    const otIds = (
      await prisma.optionType.findMany({ where: { code: { startsWith: `itest-pr-${stamp}-` } } })
    ).map((o) => o.id);
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox
        WHERE aggregate_id = ANY($1::text[])
           OR aggregate_id LIKE $2 OR aggregate_id LIKE $3`,
      [...prodIds, ...varIds, ...otIds],
      `${catOptionalId}%`,
      `${catNoneId}%`,
    );
    await prisma.product.deleteMany({ where: { categoryId: { in: cats } } }); // cascades options + variants
    await prisma.categoryOption.deleteMany({ where: { categoryId: { in: cats } } });
    await prisma.optionType.deleteMany({ where: { code: { startsWith: `itest-pr-${stamp}-` } } });
    await prisma.brand.deleteMany({ where: { slug: { startsWith: `itest-pr-${stamp}-` } } });
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.category WHERE slug LIKE $1`,
      `itest-pr-${stamp}-%`,
    );
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates a product and enforces slug / category / brand / price rules', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Cotton Tee'), slug: s('cotton-tee') },
      actor,
      {},
    );
    expect(p.status).toBe('draft');
    expect(p.brandId).toBeNull();

    await expect(
      products.create(
        { categoryId: catOptionalId, title: t('x'), slug: s('cotton-tee') },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_SLUG_TAKEN' });

    await expect(
      products.create({ categoryId: crypto.randomUUID(), title: t('x'), slug: s('x1') }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY_INVALID' });

    await expect(
      products.create({ categoryId: catNoneId, title: t('x'), slug: s('x2'), brandId }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_BRAND_INVALID' });

    await expect(
      products.create(
        { categoryId: catOptionalId, title: t('x'), slug: s('x3'), basePriceMinor: 1999 },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('configures product options and their offered values', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Tee 2'), slug: s('tee-2') },
      actor,
      {},
    );
    await productOptions.put(p.id, sizeTypeId, { position: 0 }, actor, {});
    await productOptions.put(p.id, colorTypeId, { position: 1 }, actor, {});

    await expect(productOptions.put(p.id, materialTypeId, {}, actor, {})).rejects.toMatchObject({
      code: 'PRODUCT_OPTION_NOT_CONFIGURED',
    });

    await productOptions.setValues(
      p.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']! }, { optionValueId: sizeValues['m']! }] },
      actor,
      {},
    );
    await productOptions.setValues(
      p.id,
      colorTypeId,
      { values: [{ optionValueId: colorValues['red']! }, { optionValueId: colorValues['blue']! }] },
      actor,
      {},
    );

    await expect(
      productOptions.setValues(
        p.id,
        sizeTypeId,
        { values: [{ optionValueId: colorValues['red']! }] },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_OPTION_VALUE_INVALID' });

    const list = await productOptions.list(p.id);
    expect(list.map((o) => o.optionTypeId).sort()).toEqual([sizeTypeId, colorTypeId].sort());
    expect(list.find((o) => o.optionTypeId === sizeTypeId)?.values).toHaveLength(2);
  });

  it('creates variants from valid selections and blocks dups / bad combos', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Tee 3'), slug: s('tee-3') },
      actor,
      {},
    );
    await productOptions.put(p.id, sizeTypeId, {}, actor, {});
    await productOptions.put(p.id, colorTypeId, {}, actor, {});
    await productOptions.setValues(
      p.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']! }, { optionValueId: sizeValues['m']! }] },
      actor,
      {},
    );
    await productOptions.setValues(
      p.id,
      colorTypeId,
      { values: [{ optionValueId: colorValues['red']! }] },
      actor,
      {},
    );

    const v = await variants.create(
      p.id,
      {
        selections: [
          { optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! },
          { optionTypeId: colorTypeId, optionValueId: colorValues['red']! },
        ],
        skuCode: s('sku-1'),
      },
      actor,
      {},
    );
    expect(v.selections).toHaveLength(2);
    expect(v.comboSignature.length).toBeGreaterThan(0);

    await expect(
      variants.create(
        p.id,
        {
          selections: [
            { optionTypeId: colorTypeId, optionValueId: colorValues['red']! },
            { optionTypeId: sizeTypeId, optionValueId: sizeValues['s']! },
          ],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_COMBO_EXISTS' });

    await expect(
      variants.create(
        p.id,
        { selections: [{ optionTypeId: sizeTypeId, optionValueId: sizeValues['m']! }] },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_SELECTION_INVALID' });

    await expect(
      variants.create(
        p.id,
        {
          selections: [
            { optionTypeId: sizeTypeId, optionValueId: sizeValues['l']! }, // not offered
            { optionTypeId: colorTypeId, optionValueId: colorValues['red']! },
          ],
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_SELECTION_INVALID' });

    // removing an option an existing variant uses is blocked
    await expect(productOptions.remove(p.id, sizeTypeId, actor, {})).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await variants.update(v.id, { status: 'inactive' }, actor, {});
    await variants.remove(v.id, actor, {});
    expect(await variants.list(p.id)).toHaveLength(0);
  });

  it('supports the degenerate no-option product (one empty variant)', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('One SKU'), slug: s('one-sku') },
      actor,
      {},
    );
    const v = await variants.create(p.id, { selections: [] }, actor, {});
    expect(v.comboSignature).toBe('');
    expect(v.selections).toHaveLength(0);
    await expect(variants.create(p.id, { selections: [] }, actor, {})).rejects.toMatchObject({
      code: 'VARIANT_COMBO_EXISTS',
    });
  });

  it('soft-deletes a product and writes outbox rows', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Gone'), slug: s('gone') },
      actor,
      {},
    );
    await productOptions.put(p.id, sizeTypeId, {}, actor, {});
    await products.remove(p.id, actor, {});
    await expect(products.get(p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const events = (await prisma.catalogOutbox.findMany({ where: { aggregateId: p.id } })).map(
      (r) => r.eventType,
    );
    expect(events).toContain('product.created');
    expect(events).toContain('product.options_changed');
    expect(events).toContain('product.deleted');
  });
});
