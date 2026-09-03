import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { BrandService } from './brand.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('BrandService (integration)', () => {
  let prisma: PrismaClient;
  let svc: BrandService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-brand-${stamp}-${x}`;

  beforeAll(async () => {
    prisma = getPrismaClient();
    svc = new BrandService(prisma as PrismaService, new AuditService(prisma as PrismaService));
    const acc = await prisma.account.create({
      data: { email: `itest-brand-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };
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
    await prisma.brandAlias.deleteMany({ where: { brandId: { in: ids } } });
    await prisma.brand.deleteMany({ where: { id: { in: ids } } });
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
  });

  it('soft-deletes and drops from list', async () => {
    const b = await svc.create({ name: s('gone'), slug: s('gone') }, actor, {});
    await svc.remove(b.id, actor, {});
    await expect(svc.get(b.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { items } = await svc.list({ q: s('gone') });
    expect(items).toHaveLength(0);
  });
});
