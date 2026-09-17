import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { CategoryService } from './category.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('CategoryService (integration)', () => {
  let prisma: PrismaClient;
  let svc: CategoryService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-${stamp}-${x}`;
  const name = (en: string): Record<string, string> => ({ en: s(en) });

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

  it('rejects a duplicate slug anywhere in the tree (global), including under another parent', async () => {
    const a = await svc.create({ slug: s('cat-a'), name: name('A') }, actor, {});
    const b = await svc.create({ slug: s('cat-b'), name: name('B') }, actor, {});
    await svc.create({ slug: s('dup'), name: name('x'), parentId: a.id }, actor, {});
    await expect(
      svc.create({ slug: s('dup'), name: name('y'), parentId: a.id }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN' });
    // a different parent no longer helps — slug is global
    await expect(
      svc.create({ slug: s('dup'), name: name('z'), parentId: b.id }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN' });
  });

  it('rejects a case-variant duplicate name anywhere in the tree (global)', async () => {
    const root = await svc.create({ slug: s('nm-root'), name: name('Gadgets') }, actor, {});
    await expect(
      svc.create({ slug: s('nm-2'), name: name('gadgets') }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    // nesting no longer helps — name is global
    await expect(
      svc.create({ slug: s('nm-child'), name: name('GADGETS'), parentId: root.id }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    // renaming a row onto an existing name is blocked too; a no-op rename is fine
    const other = await svc.create({ slug: s('nm-other'), name: name('Widgets') }, actor, {});
    await expect(svc.update(other.id, { name: name('gadgets') }, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_NAME_TAKEN',
    });
    await expect(
      svc.update(other.id, { name: name('Widgets'), position: 1 }, actor, {}),
    ).resolves.toMatchObject({ position: 1 });
  });

  it('update reparents a subtree, blocks cycles, and rebuilds paths', async () => {
    const r1 = await svc.create({ slug: s('u-r1'), name: name('U-R1') }, actor, {});
    const r2 = await svc.create({ slug: s('u-r2'), name: name('U-R2') }, actor, {});
    const mid = await svc.create(
      { slug: s('u-mid'), name: name('U-M'), parentId: r1.id },
      actor,
      {},
    );
    const leaf = await svc.create(
      { slug: s('u-leaf'), name: name('U-L'), parentId: mid.id },
      actor,
      {},
    );

    // cycle: r1 cannot be reparented under its own descendant `mid`
    await expect(svc.update(r1.id, { parentId: mid.id }, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_CYCLE',
    });

    // reparent `mid` (with `leaf`) under r2, in the same call as a field edit
    const moved = await svc.update(mid.id, { parentId: r2.id, position: 3 }, actor, {});
    expect(moved.parentId).toBe(r2.id);
    expect(moved.position).toBe(3);
    expect(moved.path).toBe(`${r2.path}.${mid.id.replace(/-/g, '')}`);
    const movedLeaf = await svc.get(leaf.id);
    expect(movedLeaf.path).toBe(`${moved.path}.${leaf.id.replace(/-/g, '')}`);

    // both a moved and an updated event land
    const types = (await prisma.catalogOutbox.findMany({ where: { aggregateId: mid.id } }))
      .map((r) => r.eventType)
      .sort();
    expect(types).toEqual(['category.created', 'category.moved', 'category.updated']);
  });

  it('restore cascades the archived subtree and blocks while the parent is archived', async () => {
    const root = await svc.create({ slug: s('rs-root'), name: name('RS-Root') }, actor, {});
    const child = await svc.create(
      { slug: s('rs-child'), name: name('RS-Child'), parentId: root.id },
      actor,
      {},
    );

    // archive bottom-up (a parent with live children cannot be removed)
    await svc.remove(child.id, actor, {});
    await svc.remove(root.id, actor, {});

    // cannot restore the child while its parent is still archived
    await expect(svc.restore(child.id, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_PARENT_ARCHIVED',
    });

    // restoring the root brings the whole archived subtree back
    const restored = await svc.restore(root.id, actor, {});
    expect(restored.archivedAt).toBeNull();
    const restoredChild = await svc.get(child.id);
    expect(restoredChild.archivedAt).toBeNull();
    expect(restoredChild.path).toBe(`${restored.path}.${child.id.replace(/-/g, '')}`);

    // a live row now holds the freed name → restore is blocked until it is renamed
    await svc.remove(child.id, actor, {});
    const squatter = await svc.create({ slug: s('rs-sq'), name: name('RS-Child') }, actor, {});
    await expect(svc.restore(child.id, actor, {})).rejects.toMatchObject({
      code: 'CATEGORY_NAME_TAKEN',
    });
    await svc.update(squatter.id, { name: name('RS-Squatter') }, actor, {});
    await expect(svc.restore(child.id, actor, {})).resolves.toMatchObject({ archivedAt: null });
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

  it('reorder renumbers siblings and can pull a node into a new parent', async () => {
    const p = await svc.create({ slug: s('ro-p'), name: name('RO-P') }, actor, {});
    const q = await svc.create({ slug: s('ro-q'), name: name('RO-Q') }, actor, {});
    const a = await svc.create({ slug: s('ro-a'), name: name('RO-A'), parentId: p.id }, actor, {});
    const b = await svc.create({ slug: s('ro-b'), name: name('RO-B'), parentId: p.id }, actor, {});
    const c = await svc.create({ slug: s('ro-c'), name: name('RO-C'), parentId: q.id }, actor, {});

    // sort within p: b before a
    const sorted = await svc.reorder({ parentId: p.id, orderedIds: [b.id, a.id] }, actor, {});
    expect(sorted.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(sorted.map((x) => x.position)).toEqual([0, 1]);

    // pull c from q into p, at the front → path rewritten, positions dense
    const merged = await svc.reorder({ parentId: p.id, orderedIds: [c.id, b.id, a.id] }, actor, {});
    expect(merged.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    const movedC = await svc.get(c.id);
    expect(movedC.parentId).toBe(p.id);
    expect(movedC.path).toBe(`${p.path}.${c.id.replace(/-/g, '')}`);

    // a subtree cannot be reordered under one of its own descendants
    await expect(
      svc.reorder({ parentId: c.id, orderedIds: [p.id] }, actor, {}),
    ).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' });
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

  it('update rejects a stale expectedUpdatedAt (optimistic concurrency)', async () => {
    const cat = await svc.create({ slug: s('cc'), name: name('CC') }, actor, {});

    // matching token → succeeds, and bumps updatedAt
    const ok = await svc.update(
      cat.id,
      { name: name('CC2'), expectedUpdatedAt: cat.updatedAt },
      actor,
      {},
    );
    expect(ok.updatedAt).not.toBe(cat.updatedAt);

    // the original token is now stale → 409
    await expect(
      svc.update(cat.id, { name: name('CC3'), expectedUpdatedAt: cat.updatedAt }, actor, {}),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // the fresh token works again; omitting it skips the check
    await expect(
      svc.update(cat.id, { name: name('CC4'), expectedUpdatedAt: ok.updatedAt }, actor, {}),
    ).resolves.toMatchObject({ name: { en: s('CC4') } });
    await expect(svc.update(cat.id, { position: 2 }, actor, {})).resolves.toMatchObject({
      position: 2,
    });
  });

  describe('list: pagination and search', () => {
    it('list() with no limit still returns everything under {categories} — the tree load-all path is unaffected', async () => {
      const root = await svc.create({ slug: s('pg-root'), name: name('PgRoot') }, actor, {});
      await svc.create(
        { slug: s('pg-child'), name: name('PgChild'), parentId: root.id },
        actor,
        {},
      );

      const { categories, nextCursor } = await svc.list({ status: 'all' });
      expect(nextCursor).toBeUndefined();
      const slugs = categories.map((c) => c.slug);
      expect(slugs).toContain(s('pg-root'));
      expect(slugs).toContain(s('pg-child'));
    });

    it('paginates with a path cursor — no repeats, and a parent always lands on an earlier or equal page than its child', async () => {
      const root = await svc.create({ slug: s('pag-root'), name: name('PagRoot') }, actor, {});
      const child = await svc.create(
        { slug: s('pag-child'), name: name('PagChild'), parentId: root.id },
        actor,
        {},
      );
      await svc.create({ slug: s('pag-sibling'), name: name('PagSibling') }, actor, {});

      const pageOf: Record<string, number> = {};
      let cursor: string | undefined;
      let pageNum = 0;
      const seen = new Set<string>();
      do {
        const res = await svc.list({ status: 'active', limit: 25, ...(cursor ? { cursor } : {}) });
        pageNum += 1;
        for (const c of res.categories) {
          expect(seen.has(c.id)).toBe(false); // no repeats
          seen.add(c.id);
          pageOf[c.id] = pageNum;
        }
        cursor = res.nextCursor;
      } while (cursor && pageNum < 50);

      expect(seen.has(root.id)).toBe(true);
      expect(seen.has(child.id)).toBe(true);
      expect(pageOf[root.id]).toBeLessThanOrEqual(pageOf[child.id]!); // ancestor never after descendant
    });

    it('the flat/paginated view orders siblings by drag position, not the random ltree path — the 2026-09-17 fix', async () => {
      // created in an order whose slugs (and therefore random uuid-derived
      // `path` labels) don't correlate with the position we're about to
      // give them — if the fix regressed back to `ORDER BY path`, this
      // would very likely (not just theoretically) come back in the wrong
      // order, since three random uuids essentially never happen to already
      // sort into the exact sequence position assigns them below
      const zzz = await svc.create({ slug: s('ord-zzz'), name: name('OrdZzz') }, actor, {});
      const aaa = await svc.create({ slug: s('ord-aaa'), name: name('OrdAaa') }, actor, {});
      const mmm = await svc.create({ slug: s('ord-mmm'), name: name('OrdMmm') }, actor, {});
      await svc.reorder({ parentId: null, orderedIds: [aaa.id, mmm.id, zzz.id] }, actor, {});

      const { categories } = await svc.list({ status: 'all', limit: 100 });
      const ours = categories
        .filter((c) => [aaa.id, mmm.id, zzz.id].includes(c.id))
        .map((c) => c.id);
      expect(ours).toEqual([aaa.id, mmm.id, zzz.id]);
    });

    it('a parent still sorts immediately before its children, and each level respects its own drag order', async () => {
      const root = await svc.create({ slug: s('nest-root'), name: name('NestRoot') }, actor, {});
      const childB = await svc.create(
        { slug: s('nest-b'), name: name('NestB'), parentId: root.id },
        actor,
        {},
      );
      const childA = await svc.create(
        { slug: s('nest-a'), name: name('NestA'), parentId: root.id },
        actor,
        {},
      );
      // childA created after childB, so reorder to put A first — proves the
      // flat view follows the reorder, not creation order or path
      await svc.reorder({ parentId: root.id, orderedIds: [childA.id, childB.id] }, actor, {});

      const { categories } = await svc.list({ status: 'all', limit: 100 });
      const ours = categories
        .filter((c) => [root.id, childA.id, childB.id].includes(c.id))
        .map((c) => c.id);
      expect(ours).toEqual([root.id, childA.id, childB.id]);
    });

    it('an archived category whose parent is still active shows up as an effective root in the archived view — matches the tree\'s own "orphan" handling', async () => {
      const parent = await svc.create(
        { slug: s('orph-parent'), name: name('OrphParent') },
        actor,
        {},
      );
      const child = await svc.create(
        { slug: s('orph-child'), name: name('OrphChild'), parentId: parent.id },
        actor,
        {},
      );
      await svc.remove(child.id, actor, {}); // archives the child; parent stays active

      const { categories } = await svc.list({ status: 'archived', limit: 100 });
      const ids = categories.map((c) => c.id);
      expect(ids).toContain(child.id); // still reachable, not silently dropped
      expect(ids).not.toContain(parent.id); // the still-active parent correctly excluded
    });

    it('q searches server-side, ranked by matched-token count — OR semantics, same as the client-side matcher it replaces', async () => {
      // every other `it` in this file also creates `itest-<stamp>-*` slugs,
      // so a query token has to be something *only* these rows contain —
      // `stamp` alone would (correctly, per OR semantics) match the whole
      // file's fixtures via their shared slug prefix, not just these four
      const marker = `srch${stamp}`;
      const redWidget = await svc.create(
        { slug: s('sw-rw'), name: { en: `${marker} Red Widget` } },
        actor,
        {},
      );
      const blueWidget = await svc.create(
        { slug: s('sw-bw'), name: { en: `${marker} Blue Widget` } },
        actor,
        {},
      );
      const redGadget = await svc.create(
        { slug: s('sw-rg'), name: { en: `${marker} Red Gadget` } },
        actor,
        {},
      );
      const markerOnly = await svc.create(
        { slug: s('sw-un'), name: { en: `${marker} Something Else` } },
        actor,
        {},
      );
      const noMatch = await svc.create(
        { slug: s('sw-nm'), name: name('No Match Here') },
        actor,
        {},
      );

      const { categories } = await svc.list({ status: 'all', q: `${marker} red widget` });
      const ids = categories.map((c) => c.id);
      // matches marker + red + widget (3 tokens) — ranks strictly first
      expect(ids[0]).toBe(redWidget.id);
      // OR semantics: matching only "widget" (2 tokens: marker+widget) or only
      // "red" (2 tokens: marker+red) still qualifies, same as the client's
      // `matchScore` — a query never requires *every* token to hit
      expect(ids).toContain(blueWidget.id);
      expect(ids).toContain(redGadget.id);
      expect(ids).toContain(markerOnly.id); // marker alone (1 token) still qualifies
      expect(ids).not.toContain(noMatch.id); // no token at all → excluded
    });

    it('q + limit paginates the ranked results with an offset cursor', async () => {
      const marker = `pgoff${stamp}`;
      const created = [];
      for (const n of ['a', 'b', 'c']) {
        created.push(
          await svc.create({ slug: s(`off-${n}`), name: { en: `${marker} ${n}` } }, actor, {}),
        );
      }

      const first = await svc.list({ status: 'all', q: marker, limit: 2 });
      expect(first.categories).toHaveLength(2);
      expect(first.nextCursor).toBeDefined();

      const second = await svc.list({
        status: 'all',
        q: marker,
        limit: 2,
        cursor: first.nextCursor!,
      });
      expect(second.categories).toHaveLength(1);
      const firstIds = new Set(first.categories.map((c) => c.id));
      expect(second.categories.some((c) => firstIds.has(c.id))).toBe(false);
      expect(second.nextCursor).toBeUndefined();
      // together, exactly the three rows this test created — no more, no less
      const allIds = new Set([...first.categories, ...second.categories].map((c) => c.id));
      expect(allIds).toEqual(new Set(created.map((c) => c.id)));
    });
  });
});
