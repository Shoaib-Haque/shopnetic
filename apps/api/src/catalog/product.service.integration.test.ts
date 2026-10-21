import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import { Permission, type Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { CategoryOptionService } from './category-option.service.js';
import { ProductService } from './product.service.js';
import { ProductOptionService } from './product-option.service.js';
import { VariantService } from './variant.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('Product / ProductOption / Variant (integration)', () => {
  let prisma: PrismaClient;
  let products: ProductService;
  let productOptions: ProductOptionService;
  let variants: VariantService;
  let optionTypes: OptionTypeService;
  let categoryOptions: CategoryOptionService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-pr-${stamp}-${x}`;
  const t = (en: string): Record<string, string> => ({ en: s(en) });

  let catOptionalId: string;
  let catNoneId: string;
  let catRequiredId: string;
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
    optionTypes = new OptionTypeService(pr, audit);
    categoryOptions = new CategoryOptionService(pr, audit);
    products = new ProductService(pr, audit);
    productOptions = new ProductOptionService(pr, audit);
    variants = new VariantService(pr, audit);

    const acc = await prisma.account.create({
      data: { email: `itest-pr-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const mkCat = async (slug: string, req: 'optional' | 'none' | 'required'): Promise<string> => {
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
    catRequiredId = await mkCat(s('branded'), 'required');

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
    const testCats = await prisma.category.findMany({
      where: { slug: { startsWith: `itest-pr-${stamp}-` } },
      select: { id: true },
    });
    const catIds = Array.from(
      new Set([...testCats.map((c) => c.id), catOptionalId, catNoneId, catRequiredId]),
    );
    const prodIds = (
      await prisma.product.findMany({
        where: {
          OR: [{ categoryId: { in: catIds } }, { slug: { startsWith: `itest-pr-${stamp}-` } }],
        },
      })
    ).map((p) => p.id);
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
    await prisma.product.deleteMany({
      where: {
        OR: [{ categoryId: { in: catIds } }, { id: { in: prodIds } }],
      },
    }); // cascades options + variants
    await prisma.categoryOption.deleteMany({ where: { categoryId: { in: catIds } } });
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
      products.create({ categoryId: catRequiredId, title: t('x'), slug: s('x0') }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_BRAND_REQUIRED' });

    await expect(
      products.create({ categoryId: catNoneId, title: t('x'), slug: s('x2'), brandId }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_BRAND_NOT_ALLOWED' });

    await expect(
      products.create(
        { categoryId: catOptionalId, title: t('x'), slug: s('x2b'), brandId: crypto.randomUUID() },
        actor,
        {},
      ),
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

  it('removing an option value a product actually offers is blocked with OPTION_VALUE_IN_USE, not a raw DB error', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Tee In Use'), slug: s('tee-in-use') },
      actor,
      {},
    );
    await productOptions.put(p.id, colorTypeId, {}, actor, {});
    await productOptions.setValues(
      p.id,
      colorTypeId,
      { values: [{ optionValueId: colorValues['blue']! }] },
      actor,
      {},
    );

    await expect(
      optionTypes.removeValue(colorTypeId, colorValues['blue']!, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_IN_USE', status: 409 });

    // unaffected by the blocked attempt — still there, still usable
    const type = await optionTypes.get(colorTypeId);
    expect(type.values.map((v) => v.id)).toContain(colorValues['blue']);
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
    const sizeSel = v.selections.find((s) => s.optionTypeId === sizeTypeId);
    expect(sizeSel?.optionTypeName?.en).toBeDefined();
    expect(sizeSel?.optionTypeCode).toBeDefined();
    expect(sizeSel?.optionValueCode).toBe(s('s'));

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
    const archived = await products.get(p.id);
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.status).toBe('archived');

    // restore brings it back
    const restored = await products.restore(p.id, actor, {});
    expect(restored.archivedAt).toBeNull();
    expect(restored.status).toBe('draft');

    // restore blocks if parent category is archived
    await products.remove(p.id, actor, {});
    const catToArchive = await prisma.category.create({
      data: { slug: s('temp-cat'), nameI18n: t('Temp Cat'), brandRequirement: 'none' },
    });
    const pTemp = await products.create(
      { categoryId: catToArchive.id, title: t('Temp Prod'), slug: s('temp-prod') },
      actor,
      {},
    );
    await products.remove(pTemp.id, actor, {});
    await prisma.category.update({
      where: { id: catToArchive.id },
      data: { deletedAt: new Date() },
    });
    await expect(products.restore(pTemp.id, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_PARENT_ARCHIVED',
    });

    // restore blocks if assigned brand is archived
    const brandToArchive = await prisma.brand.create({
      data: { slug: s('temp-brand'), name: 'Temp Brand' },
    });
    const pBrandTemp = await products.create(
      {
        categoryId: catOptionalId,
        brandId: brandToArchive.id,
        title: t('Temp Brand Prod'),
        slug: s('temp-brand-prod'),
      },
      actor,
      {},
    );
    await products.remove(pBrandTemp.id, actor, {});
    await prisma.brand.update({
      where: { id: brandToArchive.id },
      data: { deletedAt: new Date() },
    });
    await expect(products.restore(pBrandTemp.id, actor, {})).rejects.toMatchObject({
      code: 'BRAND_PARENT_ARCHIVED',
    });

    const events = (await prisma.catalogOutbox.findMany({ where: { aggregateId: p.id } })).map(
      (r) => r.eventType,
    );
    expect(events).toContain('product.created');
    expect(events).toContain('product.options_changed');
    expect(events).toContain('product.deleted');
    expect(events).toContain('product.restored');
  });

  it('preserves pre-archive status on restore and prevents _previousStatus leak in spec', async () => {
    // 1. Active product restores to active
    const pActive = await products.create(
      { categoryId: catOptionalId, title: t('Active Prod'), slug: s('active-prod') },
      actor,
      {},
    );
    await products.update(
      pActive.id,
      { status: 'active', expectedUpdatedAt: pActive.updatedAt },
      actor,
      {},
    );
    await products.remove(pActive.id, actor, {});

    const archivedActive = await products.get(pActive.id);
    expect(archivedActive.status).toBe('archived');
    expect(archivedActive.spec).not.toHaveProperty('_previousStatus');

    const restoredActive = await products.restore(pActive.id, actor, {});
    expect(restoredActive.status).toBe('active');
    expect(restoredActive.archivedAt).toBeNull();
    expect(restoredActive.spec).not.toHaveProperty('_previousStatus');

    // 2. Draft product restores to draft
    const pDraft = await products.create(
      { categoryId: catOptionalId, title: t('Draft Prod'), slug: s('draft-prod') },
      actor,
      {},
    );
    expect(pDraft.status).toBe('draft');
    await products.remove(pDraft.id, actor, {});

    const restoredDraft = await products.restore(pDraft.id, actor, {});
    expect(restoredDraft.status).toBe('draft');
    expect(restoredDraft.archivedAt).toBeNull();
    expect(restoredDraft.spec).not.toHaveProperty('_previousStatus');

    // 3. Legacy archived product (no _previousStatus recorded) falls back to active
    const pLegacy = await products.create(
      { categoryId: catOptionalId, title: t('Legacy Prod'), slug: s('legacy-prod') },
      actor,
      {},
    );
    await prisma.product.update({
      where: { id: pLegacy.id },
      data: { deletedAt: new Date(), status: 'archived', spec: {} },
    });
    const restoredLegacy = await products.restore(pLegacy.id, actor, {});
    expect(restoredLegacy.status).toBe('active');
    expect(restoredLegacy.archivedAt).toBeNull();
    expect(restoredLegacy.spec).not.toHaveProperty('_previousStatus');
  });

  it('update rejects a stale expectedUpdatedAt (optimistic concurrency)', async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Occ Prod'), slug: s('occ-prod') },
      actor,
      {},
    );
    await expect(
      products.update(
        p.id,
        { title: t('Occ Next'), expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      products.update(p.id, { title: t('Occ Next'), expectedUpdatedAt: p.updatedAt }, actor, {}),
    ).resolves.toMatchObject({ id: p.id });
  });

  it('list filters by status, origin, and searches by multi-token q', async () => {
    const p1 = await products.create(
      { categoryId: catOptionalId, title: { en: 'Alpha Running Shoe' }, slug: s('alpha-shoe') },
      actor,
      {},
    );
    const sellerId = crypto.randomUUID();
    const p2 = await products.create(
      {
        categoryId: catOptionalId,
        title: { en: 'Beta Trail Running' },
        slug: s('beta-shoe'),
        proposedBySellerId: sellerId,
        status: 'pending',
      },
      actor,
      {},
    );

    // Origin 1p vs 3p
    const res1p = await products.list({ origin: '1p', q: 'Running' });
    const ids1p = res1p.items.map((x) => x.id);
    expect(ids1p).toContain(p1.id);
    expect(ids1p).not.toContain(p2.id);

    const res3p = await products.list({ origin: '3p' });
    const ids3p = res3p.items.map((x) => x.id);
    expect(ids3p).toContain(p2.id);
    expect(ids3p).not.toContain(p1.id);

    // Multi-token search: 'Alpha Shoe' matches p1
    const resSearch = await products.list({ q: 'Alpha Shoe' });
    expect(resSearch.items.map((x) => x.id)).toContain(p1.id);

    // Status filter
    const resPending = await products.list({ status: 'pending' });
    expect(resPending.items.map((x) => x.id)).toContain(p2.id);
    expect(resPending.items.map((x) => x.id)).not.toContain(p1.id);
  });

  it("a product's create/update/delete audit rows snapshot category and brand names — the 2026-09-17 fix", async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Named Tee'), slug: s('named-tee'), brandId },
      actor,
      {},
    );
    const created = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.product_created', targetId: p.id },
    });
    expect(created.after).toMatchObject({ categoryName: s(s('apparel')), brandName: s('Acme') });

    await products.update(p.id, { brandId: null }, actor, {});
    const updated = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.product_updated', targetId: p.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(updated.before).toMatchObject({ categoryName: s(s('apparel')), brandName: s('Acme') });
    expect(updated.after).toMatchObject({ categoryName: s(s('apparel')), brandName: null });

    await products.remove(p.id, actor, {});
    const removed = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.product_deleted', targetId: p.id },
    });
    expect(removed.before).toMatchObject({ categoryName: s(s('apparel')), brandName: null });
  });

  it("a product option's set-values/remove audit rows snapshot the option type's code — the 2026-09-17 fix", async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Opt Codes'), slug: s('opt-codes') },
      actor,
      {},
    );
    await productOptions.put(p.id, sizeTypeId, {}, actor, {});
    await productOptions.setValues(
      p.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']! }] },
      actor,
      {},
    );
    const setValuesEvent = await prisma.auditEvent.findFirstOrThrow({
      where: {
        action: 'catalog.product_options_changed',
        targetId: `${p.id}:${sizeTypeId}`,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(setValuesEvent.after).toMatchObject({
      optionTypeId: sizeTypeId,
      optionTypeCode: s('size'),
    });

    await productOptions.remove(p.id, sizeTypeId, actor, {});
    const removeEvent = await prisma.auditEvent.findFirstOrThrow({
      where: {
        action: 'catalog.product_options_changed',
        targetId: `${p.id}:${sizeTypeId}`,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(removeEvent.before).toMatchObject({
      optionTypeId: sizeTypeId,
      optionTypeCode: s('size'),
    });
  });

  it("a variant's create/update/delete audit rows snapshot the product title and readable selection codes — the 2026-09-17 fix", async () => {
    const p = await products.create(
      { categoryId: catOptionalId, title: t('Labeled Tee'), slug: s('labeled-tee') },
      actor,
      {},
    );
    await productOptions.put(p.id, sizeTypeId, {}, actor, {});
    await productOptions.put(p.id, colorTypeId, {}, actor, {});
    await productOptions.setValues(
      p.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['m']! }] },
      actor,
      {},
    );
    await productOptions.setValues(
      p.id,
      colorTypeId,
      { values: [{ optionValueId: colorValues['blue']! }] },
      actor,
      {},
    );

    const v = await variants.create(
      p.id,
      {
        selections: [
          { optionTypeId: sizeTypeId, optionValueId: sizeValues['m']! },
          { optionTypeId: colorTypeId, optionValueId: colorValues['blue']! },
        ],
      },
      actor,
      {},
    );
    const created = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.variant_created', targetId: v.id },
    });
    expect(created.after).toMatchObject({
      productTitle: s('Labeled Tee'),
      selections: expect.arrayContaining([
        expect.objectContaining({
          optionTypeId: sizeTypeId,
          optionTypeCode: s('size'),
          optionValueId: sizeValues['m'],
          optionValueCode: s('m'),
        }),
        expect.objectContaining({
          optionTypeId: colorTypeId,
          optionTypeCode: s('color'),
          optionValueId: colorValues['blue'],
          optionValueCode: s('blue'),
        }),
      ]),
    });

    await variants.update(v.id, { status: 'inactive' }, actor, {});
    const updated = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.variant_updated', targetId: v.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(updated.before).toMatchObject({ productTitle: s('Labeled Tee') });
    expect(updated.after).toMatchObject({ productTitle: s('Labeled Tee') });
    expect((updated.after as { selections: unknown[] }).selections).toHaveLength(2);

    await variants.remove(v.id, actor, {});
    const removed = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.variant_deleted', targetId: v.id },
    });
    expect(removed.before).toMatchObject({ productTitle: s('Labeled Tee') });
    expect((removed.before as { selections: unknown[] }).selections).toHaveLength(2);
  });

  it('enforces review mode rules on pending products (block edits, approve permissions, reject notes, sub-service mutations)', async () => {
    const approverActor: Actor = {
      accountId: actor.accountId,
      plane: 'staff',
      grants: [
        {
          role: 'admin',
          scopeType: 'global',
          scopeId: null,
          permissions: [Permission.PRODUCT_APPROVE, Permission.PRODUCT_MANAGE],
        },
      ],
    };
    const nonApproverActor: Actor = {
      accountId: actor.accountId,
      plane: 'staff',
      grants: [
        {
          role: 'staff',
          scopeType: 'global',
          scopeId: null,
          permissions: [Permission.PRODUCT_MANAGE],
        },
      ],
    };

    // 1. Create a pending product
    const p = await products.create(
      {
        categoryId: catOptionalId,
        title: t('Pending Tee'),
        slug: s('pending-tee'),
        status: 'pending',
      },
      actor,
      {},
    );
    expect(p.status).toBe('pending');

    // 2. Editing fields while pending is blocked with PRODUCT_IN_REVIEW (422)
    await expect(
      products.update(p.id, { title: t('Changed Title') }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_IN_REVIEW', status: 422 });

    await expect(
      products.update(p.id, { slug: s('changed-slug') }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_IN_REVIEW', status: 422 });

    // 3. Reading options & variants on pending product succeeds (not blocked by review mode)
    const pendingOptions = await productOptions.list(p.id);
    expect(Array.isArray(pendingOptions)).toBe(true);
    const pendingVariants = await variants.list(p.id);
    expect(Array.isArray(pendingVariants)).toBe(true);

    // 4. Mutating product options on pending product is blocked with PRODUCT_IN_REVIEW (409)
    await expect(productOptions.put(p.id, sizeTypeId, {}, actor, {})).rejects.toMatchObject({
      code: 'PRODUCT_IN_REVIEW',
      status: 409,
    });

    // 5. Mutating variants on pending product is blocked with PRODUCT_IN_REVIEW (409)
    await expect(variants.create(p.id, { selections: [] }, actor, {})).rejects.toMatchObject({
      code: 'PRODUCT_IN_REVIEW',
      status: 409,
    });

    // 6. Deleting a product while pending review is blocked with PRODUCT_IN_REVIEW (422)
    await expect(products.remove(p.id, actor, {})).rejects.toMatchObject({
      code: 'PRODUCT_IN_REVIEW',
      status: 422,
    });

    // 7. Approving without Permission.PRODUCT_APPROVE throws 403 FORBIDDEN
    await expect(
      products.update(p.id, { status: 'active' }, nonApproverActor, {}),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    // 8. Rejecting with rejection note succeeds and transitions to draft
    const rejected = await products.update(
      p.id,
      {
        status: 'draft',
        spec: { rejectionNote: 'Needs better imagery', rejectedAt: new Date().toISOString() },
        expectedUpdatedAt: p.updatedAt,
      },
      actor,
      {},
    );
    expect(rejected.status).toBe('draft');
    expect(rejected.spec).toMatchObject({ rejectionNote: 'Needs better imagery' });

    const rejectAudit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.product_rejected', targetId: p.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(rejectAudit.action).toBe('catalog.product_rejected');

    // 9. Transition back to pending
    const pendingAgain = await products.update(
      p.id,
      { status: 'pending', expectedUpdatedAt: rejected.updatedAt },
      actor,
      {},
    );
    expect(pendingAgain.status).toBe('pending');

    // 10. Rejecting without a rejection note also succeeds
    const rejectedNoNote = await products.update(
      p.id,
      { status: 'draft', expectedUpdatedAt: pendingAgain.updatedAt },
      actor,
      {},
    );
    expect(rejectedNoNote.status).toBe('draft');

    const pendingForApprove = await products.update(
      p.id,
      { status: 'pending', expectedUpdatedAt: rejectedNoNote.updatedAt },
      actor,
      {},
    );
    expect(pendingForApprove.status).toBe('pending');

    // 11. Approving with approverActor succeeds and transitions to active
    const approved = await products.update(
      p.id,
      { status: 'active', expectedUpdatedAt: pendingForApprove.updatedAt },
      approverActor,
      {},
    );
    expect(approved.status).toBe('active');

    const approveAudit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.product_approved', targetId: p.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(approveAudit.action).toBe('catalog.product_approved');
  });

  it('blocks publishing a product to active when required category options are missing or unconfigured', async () => {
    // Configure sizeTypeId as a required option on catRequiredId
    await categoryOptions.put(
      catRequiredId,
      sizeTypeId,
      { applicability: 'required', isVariantAxis: true, valueSource: 'open' },
      actor,
      {},
    );

    const pReq = await products.create(
      { categoryId: catRequiredId, brandId, title: t('Req Prod'), slug: s('req-prod') },
      actor,
      {},
    );
    expect(pReq.status).toBe('draft');

    // Trying to publish without configuring the required option fails with PRODUCT_OPTION_NOT_CONFIGURED (422)
    await expect(
      products.update(pReq.id, { status: 'active', expectedUpdatedAt: pReq.updatedAt }, actor, {}),
    ).rejects.toMatchObject({ code: 'PRODUCT_OPTION_NOT_CONFIGURED', status: 422 });

    // Configure the option but with 0 values
    await productOptions.put(pReq.id, sizeTypeId, {}, actor, {});
    const pWithOpt = await products.get(pReq.id);
    await expect(
      products.update(
        pReq.id,
        { status: 'active', expectedUpdatedAt: pWithOpt.updatedAt },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_OPTION_NOT_CONFIGURED', status: 422 });

    // Configure offered values
    await productOptions.setValues(
      pReq.id,
      sizeTypeId,
      { values: [{ optionValueId: sizeValues['s']! }] },
      actor,
      {},
    );
    const pConfigured = await products.get(pReq.id);

    // Now publishing succeeds
    const published = await products.update(
      pReq.id,
      { status: 'active', expectedUpdatedAt: pConfigured.updatedAt },
      actor,
      {},
    );
    expect(published.status).toBe('active');
  });
});
