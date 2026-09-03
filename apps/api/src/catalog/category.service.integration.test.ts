import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { CategoryService } from './category.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

const name = (en: string): Record<string, string> => ({ en });

describe.skipIf(!hasDb)('CategoryService (integration)', () => {
  let prisma: PrismaClient;
  let svc: CategoryService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-${stamp}-${x}`;

  beforeAll(async () => {
    prisma = getPrismaClient();
    svc = new CategoryService(prisma as PrismaService, new AuditService(prisma as PrismaService));
    // a real account id so the audit-event FK is satisfied
    const acc = await prisma.account.create({
      data: { email: `itest-cat-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_id IN (SELECT id::text FROM catalog.category WHERE slug LIKE $1)`,
      `itest-${stamp}-%`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.category WHERE slug LIKE $1`,
      `itest-${stamp}-%`,
    );
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('builds ltree paths root → child → grandchild', async () => {
    const root = await svc.create({ slug: s('electronics'), name: name('Electronics') }, actor, {});
    expect(root.parentId).toBeNull();
    expect(root.depth).toBe(1);
    expect(root.path).toBe(root.id.replace(/-/g, ''));

    const child = await svc.create(
      { slug: s('phones'), name: name('Phones'), parentId: root.id },
      actor,
      {},
    );
    expect(child.parentId).toBe(root.id);
    expect(child.depth).toBe(2);
    expect(child.path).toBe(`${root.path}.${child.id.replace(/-/g, '')}`);

    const grand = await svc.create(
      { slug: s('android'), name: name('Android'), parentId: child.id },
      actor,
      {},
    );
    expect(grand.depth).toBe(3);
    expect(grand.path.startsWith(`${root.path}.`)).toBe(true);
  });

  it('rejects a duplicate sibling slug but allows the same slug under a different parent', async () => {
    const a = await svc.create({ slug: s('cat-a'), name: name('A') }, actor, {});
    const b = await svc.create({ slug: s('cat-b'), name: name('B') }, actor, {});
    await expect(
      svc
        .create({ slug: s('dup'), name: name('x'), parentId: a.id }, actor, {})
        .then(() => svc.create({ slug: s('dup'), name: name('y'), parentId: a.id }, actor, {})),
    ).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN' });
    await expect(
      svc.create({ slug: s('dup'), name: name('z'), parentId: b.id }, actor, {}),
    ).resolves.toMatchObject({ slug: s('dup') });
  });

  it('move rewrites the whole subtree and blocks cycles', async () => {
    const r1 = await svc.create({ slug: s('r1'), name: name('R1') }, actor, {});
    const r2 = await svc.create({ slug: s('r2'), name: name('R2') }, actor, {});
    const mid = await svc.create({ slug: s('mid'), name: name('M'), parentId: r1.id }, actor, {});
    const leaf = await svc.create(
      { slug: s('leaf'), name: name('L'), parentId: mid.id },
      actor,
      {},
    );

    // cycle: r1 cannot move under its own descendant `mid`
    await expect(svc.move(r1.id, { parentId: mid.id }, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_CYCLE',
    });

    // move `mid` (with `leaf`) under r2
    const movedMid = await svc.move(mid.id, { parentId: r2.id }, actor, {});
    expect(movedMid.parentId).toBe(r2.id);
    expect(movedMid.path).toBe(`${r2.path}.${mid.id.replace(/-/g, '')}`);

    const movedLeaf = await svc.get(leaf.id);
    expect(movedLeaf.path).toBe(`${movedMid.path}.${leaf.id.replace(/-/g, '')}`);
    expect(movedLeaf.depth).toBe(3);
  });

  it('soft-deletes a leaf, blocks deleting a parent with children', async () => {
    const p = await svc.create({ slug: s('del-p'), name: name('P') }, actor, {});
    const c = await svc.create({ slug: s('del-c'), name: name('C'), parentId: p.id }, actor, {});

    await expect(svc.remove(p.id, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_HAS_CHILDREN',
    });

    await svc.remove(c.id, actor, {});
    await expect(svc.get(c.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // now the parent has no live children → delete works
    await svc.remove(p.id, actor, {});
    await expect(svc.get(p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('writes a catalog.outbox row per mutation', async () => {
    const cat = await svc.create({ slug: s('obx'), name: name('O') }, actor, {});
    await svc.update(cat.id, { position: 5 }, actor, {});
    const rows = await prisma.catalogOutbox.findMany({ where: { aggregateId: cat.id } });
    const types = rows.map((r) => r.eventType).sort();
    expect(types).toEqual(['category.created', 'category.updated']);
  });
});
