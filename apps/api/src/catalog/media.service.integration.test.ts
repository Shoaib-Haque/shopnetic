import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { ProductOptionService } from './product-option.service.js';
import { MediaService } from './media.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('MediaService (integration)', () => {
  let prisma: PrismaClient;
  let media: MediaService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-md-${stamp}-${x}`;
  const t = (en: string): Record<string, string> => ({ en: s(en) });

  let productId: string;
  let categoryId: string;
  let colorTypeId: string;
  let colorBlackId: string;
  let sizeTypeId: string;
  let sizeSId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    const optionTypes = new OptionTypeService(pr, audit);
    media = new MediaService(pr, audit);

    const acc = await prisma.account.create({
      data: { email: `itest-md-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const cat = await prisma.category.create({
      data: { slug: s('cat'), nameI18n: t('Cat'), brandRequirement: 'none' },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
      cat.id.replace(/-/g, ''),
      cat.id,
    );
    categoryId = cat.id;

    const product = await prisma.product.create({
      data: { slug: s('prod'), categoryId, titleI18n: t('Prod'), status: 'active' },
    });
    productId = product.id;

    const color = await optionTypes.create(
      {
        code: s('color'),
        name: t('Color'),
        values: [{ code: s('black'), label: t('Black') }],
      },
      actor,
      {},
    );
    colorTypeId = color.id;
    colorBlackId = color.values[0]!.id;

    const size = await optionTypes.create(
      { code: s('size'), name: t('Size'), values: [{ code: s('s'), label: t('S') }] },
      actor,
      {},
    );
    sizeTypeId = size.id;
    sizeSId = size.values[0]!.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = (await prisma.mediaAsset.findMany({ where: { ownerId: productId } })).map(
      (m) => m.id,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type = 'media_asset' AND aggregate_id = ANY($1::text[])`,
      ids,
    );
    await prisma.mediaAsset.deleteMany({ where: { ownerId: productId } }); // tags cascade
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.categoryOption.deleteMany({ where: { categoryId } });
    await prisma.optionType.deleteMany({ where: { code: { startsWith: `itest-md-${stamp}-` } } });
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.category WHERE slug LIKE $1`,
      `itest-md-${stamp}-%`,
    );
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates product media, defaults to pending, and lists by position', async () => {
    const a = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('img-a.jpg'), position: 1, width: 1200, height: 1200 },
      actor,
      {},
    );
    expect(a.status).toBe('pending');
    expect(a.ownerType).toBe('product');

    await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('img-b.jpg'), position: 0 },
      actor,
      {},
    );
    const list = await media.listForOwner('product', productId);
    expect(list.map((m) => m.fileKey)).toEqual([s('img-b.jpg'), s('img-a.jpg')]);
  });

  it('rejects an unknown product owner and offer-owned media', async () => {
    await expect(
      media.create('product', crypto.randomUUID(), { kind: 'image', fileKey: s('x') }, actor, {}),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      media.create('offer', productId, { kind: 'image', fileKey: s('x') }, actor, {}),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updates metadata + status', async () => {
    const a = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('u.jpg') },
      actor,
      {},
    );
    const up = await media.update(
      a.id,
      { status: 'active', blurhash: 'LKO2', alt: t('a shoe') },
      actor,
      {},
    );
    expect(up.status).toBe('active');
    expect(up.blurhash).toBe('LKO2');
    expect(up.alt).toEqual(t('a shoe'));
  });

  it('tags an asset to an option value and rejects a cross-type value', async () => {
    const a = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('t.jpg') },
      actor,
      {},
    );

    await expect(media.putTag(a.id, colorTypeId, sizeSId, actor, {})).rejects.toMatchObject({
      code: 'MEDIA_TAG_INVALID',
    });

    const tagged = await media.putTag(a.id, colorTypeId, colorBlackId, actor, {});
    expect(tagged.tags).toHaveLength(1);
    expect(tagged.tags[0]).toMatchObject({
      optionTypeId: colorTypeId,
      optionTypeCode: s('color'),
      optionValueId: colorBlackId,
    });

    // one tag per axis — re-tagging the same axis replaces
    await media.putTag(a.id, colorTypeId, colorBlackId, actor, {});
    // a second axis is additive
    await media.putTag(a.id, sizeTypeId, sizeSId, actor, {});
    expect((await media.get(a.id)).tags).toHaveLength(2);

    // the tag audit rows snapshot both codes, not just ids (2026-09-17 fix)
    const tagEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.media_updated', targetId: a.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(tagEvent.after).toMatchObject({
      tag: {
        optionTypeId: sizeTypeId,
        optionTypeCode: s('size'),
        optionValueId: sizeSId,
        optionValueCode: s('s'),
      },
    });

    await media.removeTag(a.id, sizeTypeId, actor, {});
    expect((await media.get(a.id)).tags).toHaveLength(1);
    const untagEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.media_updated', targetId: a.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(untagEvent.before).toMatchObject({
      untaggedAxis: sizeTypeId,
      untaggedAxisCode: s('size'),
    });

    await expect(media.removeTag(a.id, sizeTypeId, actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes an asset (tags cascade) and writes outbox rows', async () => {
    const a = await media.create(
      'product',
      productId,
      { kind: 'video', fileKey: s('v.mp4'), posterKey: s('v.jpg'), durationS: 12 },
      actor,
      {},
    );
    await media.putTag(a.id, colorTypeId, colorBlackId, actor, {});
    await media.remove(a.id, actor, {});
    await expect(media.get(a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const events = (await prisma.catalogOutbox.findMany({ where: { aggregateId: a.id } })).map(
      (r) => r.eventType,
    );
    expect(events).toContain('media.created');
    expect(events).toContain('media.updated');
    expect(events).toContain('media.deleted');
    const tagsLeft = await prisma.mediaOptionTag.count({ where: { mediaAssetId: a.id } });
    expect(tagsLeft).toBe(0);
  });

  it('reorders media assets transactionally and rejects duplicates or unknown IDs', async () => {
    const m1 = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('order1.jpg'), position: 0 },
      actor,
      {},
    );
    const m2 = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('order2.jpg'), position: 1 },
      actor,
      {},
    );
    const m3 = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('order3.jpg'), position: 2 },
      actor,
      {},
    );

    // Rejects duplicate IDs
    await expect(
      media.reorder('product', productId, [m1.id, m1.id, m3.id], actor, {}),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Rejects unknown ID
    await expect(
      media.reorder('product', productId, [m1.id, crypto.randomUUID(), m3.id], actor, {}),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Reverse order
    const reordered = await media.reorder('product', productId, [m3.id, m2.id, m1.id], actor, {});
    const positions = reordered
      .filter((m) => [m1.id, m2.id, m3.id].includes(m.id))
      .map((m) => ({ id: m.id, position: m.position }));
    expect(positions).toEqual([
      { id: m3.id, position: 0 },
      { id: m2.id, position: 1 },
      { id: m1.id, position: 2 },
    ]);
  });

  it('cleans up dependent media option tags when an option type or value is removed', async () => {
    const pr = prisma as PrismaService;
    const audit = new AuditService(pr);
    const productOptions = new ProductOptionService(pr, audit);

    await prisma.categoryOption.upsert({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId: colorTypeId } },
      update: { applicability: 'optional' },
      create: { categoryId, optionTypeId: colorTypeId, applicability: 'optional' },
    });
    await productOptions.put(productId, colorTypeId, {}, actor, {});
    await productOptions.setValues(
      productId,
      colorTypeId,
      { values: [{ optionValueId: colorBlackId }] },
      actor,
      {},
    );

    const a = await media.create(
      'product',
      productId,
      { kind: 'image', fileKey: s('tag-cleanup.jpg') },
      actor,
      {},
    );
    await media.putTag(a.id, colorTypeId, colorBlackId, actor, {});
    expect((await media.get(a.id)).tags).toHaveLength(1);

    // Remove color option from product
    await productOptions.remove(productId, colorTypeId, actor, {});

    // Verify tag was cleaned up
    const updated = await media.get(a.id);
    expect(updated.tags).toHaveLength(0);
  });
});
