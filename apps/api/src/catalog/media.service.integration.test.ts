import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import { MediaService } from './media.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const t = (en: string): Record<string, string> => ({ en });

describe.skipIf(!hasDb)('MediaService (integration)', () => {
  let prisma: PrismaClient;
  let media: MediaService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-md-${stamp}-${x}`;

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
    expect(up.alt).toEqual({ en: 'a shoe' });
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

    await media.removeTag(a.id, sizeTypeId, actor, {});
    expect((await media.get(a.id)).tags).toHaveLength(1);
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
});
