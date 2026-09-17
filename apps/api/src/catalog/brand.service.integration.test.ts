import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { BrandService } from './brand.service.js';
import { ProductService } from './product.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('BrandService (integration)', () => {
  let prisma: PrismaClient;
  let svc: BrandService;
  let products: ProductService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-brand-${stamp}-${x}`;
  const t = (en: string): Record<string, string> => ({ en: s(en) });

  let categoryId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    const pr = prisma as PrismaService;
    svc = new BrandService(pr, new AuditService(pr));
    products = new ProductService(pr, new AuditService(pr));
    const acc = await prisma.account.create({
      data: { email: `itest-brand-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };

    const cat = await prisma.category.create({
      data: { slug: s('cat'), nameI18n: t('Cat'), brandRequirement: 'optional' },
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
    const ids = (
      await prisma.brand.findMany({ where: { slug: { startsWith: `itest-brand-${stamp}-` } } })
    ).map((b) => b.id);
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type = 'brand' AND aggregate_id = ANY($1::text[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type = 'product' AND aggregate_id IN
         (SELECT id::text FROM catalog.product WHERE category_id = $1::uuid)`,
      categoryId,
    );
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.brandAlias.deleteMany({ where: { brandId: { in: ids } } });
    await prisma.brand.deleteMany({ where: { id: { in: ids } } });
    await prisma.$executeRawUnsafe(`DELETE FROM catalog.category WHERE id = $1::uuid`, categoryId);
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates a brand with a derived slug + aliases', async () => {
    const b = await svc.create(
      { name: `${s('JBL')} Audio`, aliases: [s('jbl'), s('jbl-audio')] },
      actor,
      {},
    );
    expect(b.slug).toBe(`${s('jbl')}-audio`);
    expect(b.status).toBe('active');
    expect(b.aliases.map((a) => a.alias).sort()).toEqual([s('jbl'), s('jbl-audio')].sort());
  });

  it('rejects a duplicate slug and a duplicate alias', async () => {
    await svc.create({ name: s('acme'), slug: s('acme') }, actor, {});
    await expect(svc.create({ name: 'x', slug: s('acme') }, actor, {})).rejects.toMatchObject({
      code: 'BRAND_SLUG_TAKEN',
    });
    const a = await svc.create(
      { name: s('one'), slug: s('one'), aliases: [s('shared')] },
      actor,
      {},
    );
    await expect(
      svc.create({ name: s('two'), slug: s('two'), aliases: [s('shared')] }, actor, {}),
    ).rejects.toMatchObject({ code: 'BRAND_ALIAS_TAKEN' });
    await expect(svc.addAlias(a.id, { alias: s('shared') }, actor, {})).rejects.toMatchObject({
      code: 'BRAND_ALIAS_TAKEN',
    });
  });

  it('rejects a case-variant duplicate brand name', async () => {
    await svc.create({ name: `${s('zenith')} Audio`, slug: s('zenith-b') }, actor, {});
    await expect(
      svc.create({ name: `${s('ZENITH')} AUDIO`, slug: s('zenith-c') }, actor, {}),
    ).rejects.toMatchObject({ code: 'BRAND_NAME_TAKEN' });
  });

  it('merges: aliases move to the target, source name becomes an alias, source is flagged', async () => {
    // target already carries an alias equal to the source's slug → merge must
    // not create a duplicate for it.
    const target = await svc.create(
      { name: s('keeper'), slug: s('keeper'), aliases: [s('dupe')] },
      actor,
      {},
    );
    const source = await svc.create(
      { name: s('dupe-name'), slug: s('dupe'), aliases: [s('d1')] },
      actor,
      {},
    );

    await expect(svc.merge(source.id, { intoBrandId: source.id }, actor, {})).rejects.toMatchObject(
      {
        code: 'BRAND_MERGE_INVALID',
      },
    );

    const merged = await svc.merge(source.id, { intoBrandId: target.id }, actor, {});
    const aliases = merged.aliases.map((a) => a.alias);
    expect(aliases).toContain(s('d1')); // moved from source
    expect(aliases).toContain(s('dupe-name')); // source name added
    expect(aliases.filter((a) => a === s('dupe'))).toHaveLength(1); // slug collision skipped

    await expect(svc.get(source.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const raw = await prisma.brand.findUniqueOrThrow({ where: { id: source.id } });
    expect(raw.mergedIntoBrandId).toBe(target.id);
    expect(raw.deletedAt).not.toBeNull();

    // a merged brand is soft-deleted → it can't be a merge target any more
    await expect(svc.merge(target.id, { intoBrandId: source.id }, actor, {})).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );

    // the audit row snapshots the target's *name*, not just its id (2026-09-17
    // fix) — both in the structured `after` and in the free-text `reason`
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.brand_merged', targetId: source.id },
    });
    expect(event.after).toMatchObject({
      mergedIntoBrandId: target.id,
      mergedIntoBrandName: s('keeper'),
    });
    expect(event.reason).toBe(`merged into ${s('keeper')}`);
  });

  it("removing an alias's audit row snapshots the alias text, not just its id — the 2026-09-17 fix", async () => {
    const b = await svc.create(
      { name: s('alias-host'), slug: s('alias-host'), aliases: [s('ah-alias')] },
      actor,
      {},
    );
    const aliasId = b.aliases.find((a) => a.alias === s('ah-alias'))?.id ?? '';

    await expect(svc.removeAlias(b.id, crypto.randomUUID(), actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await svc.removeAlias(b.id, aliasId, actor, {});
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.brand_updated', targetId: b.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(event.before).toMatchObject({ aliasId, alias: s('ah-alias') });
    expect((await svc.get(b.id)).aliases).toHaveLength(0);
  });

  it('soft-deletes and drops from list', async () => {
    const b = await svc.create({ name: s('gone'), slug: s('gone') }, actor, {});
    await svc.remove(b.id, actor, {});
    await expect(svc.get(b.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { items } = await svc.list({ q: s('gone') });
    expect(items).toHaveLength(0);
  });

  it('isRestricted is orthogonal to status — settable on create and update, independently of it', async () => {
    const b = await svc.create(
      { name: s('flagged'), slug: s('flagged'), isRestricted: true },
      actor,
      {},
    );
    expect(b).toMatchObject({ status: 'active', isRestricted: true });

    const unflagged = await svc.update(b.id, { isRestricted: false }, actor, {});
    expect(unflagged).toMatchObject({ status: 'active', isRestricted: false });

    // flipping status doesn't touch isRestricted, and vice versa
    const reflagged = await svc.update(b.id, { isRestricted: true, status: 'active' }, actor, {});
    expect(reflagged).toMatchObject({ status: 'active', isRestricted: true });
  });

  it('remove() relinks any live products to no brand rather than leaving them dangling — the 2026-09-17 fix', async () => {
    const b = await svc.create({ name: s('relink-host'), slug: s('relink-host') }, actor, {});
    const p1 = await products.create(
      { categoryId, title: t('Relink P1'), slug: s('relink-p1'), brandId: b.id },
      actor,
      {},
    );
    const p2 = await products.create(
      { categoryId, title: t('Relink P2'), slug: s('relink-p2'), brandId: b.id },
      actor,
      {},
    );

    await svc.remove(b.id, actor, {});

    expect((await products.get(p1.id)).brandId).toBeNull();
    expect((await products.get(p2.id)).brandId).toBeNull();

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.brand_deleted', targetId: b.id },
    });
    expect(event.reason).toBe('soft delete (2 products relinked to no brand)');
  });

  it('restore brings an archived brand back, blocked once a live row has taken its name/slug', async () => {
    const b = await svc.create({ name: s('rs-brand'), slug: s('rs-brand') }, actor, {});
    await svc.remove(b.id, actor, {});
    await expect(svc.get(b.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(svc.restore(crypto.randomUUID(), actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // a live brand isn't "archived" — restore only targets a deleted one
    const live = await svc.create({ name: s('rs-live'), slug: s('rs-live') }, actor, {});
    await expect(svc.restore(live.id, actor, {})).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const restored = await svc.restore(b.id, actor, {});
    expect(restored).toMatchObject({ id: b.id, name: s('rs-brand') });
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.brand_restored', targetId: b.id },
    });
    expect(event.after).toMatchObject({ id: b.id });

    // a live row now holds the freed *name* → restore is blocked until it
    // moves. (Unlike category, `brand.slug` is a full — not partial —
    // unique DB constraint, so a soft-deleted brand's slug can never be
    // picked up by anything else in the first place; only name collisions
    // are reachable here.)
    await svc.remove(b.id, actor, {});
    const squatter = await svc.create({ name: s('rs-brand'), slug: s('rs-squatter') }, actor, {});
    await expect(svc.restore(b.id, actor, {})).rejects.toMatchObject({ code: 'BRAND_NAME_TAKEN' });
    await svc.update(squatter.id, { name: s('rs-squatter-2') }, actor, {});
    await expect(svc.restore(b.id, actor, {})).resolves.toMatchObject({ id: b.id });
  });

  it('list({archived: true}) is the only way back to a soft-deleted row once the delete undo window has passed', async () => {
    const b = await svc.create({ name: s('arch-me'), slug: s('arch-me') }, actor, {});
    await svc.remove(b.id, actor, {});

    const live = await svc.list({ q: s('arch-me') });
    expect(live.items.map((x) => x.id)).not.toContain(b.id);

    const archived = await svc.list({ archived: true, q: s('arch-me') });
    expect(archived.items.map((x) => x.id)).toContain(b.id);
  });
});
