import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { Actor } from '@shopnetic/auth';
import { AuditService } from '../audit/audit.service.js';
import { OptionTypeService } from './option-type.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('OptionTypeService (integration)', () => {
  let prisma: PrismaClient;
  let svc: OptionTypeService;
  let actor: Actor;
  const stamp = Date.now();
  const s = (x: string): string => `itest-opt-${stamp}-${x}`;
  const name = (en: string): Record<string, string> => ({ en: s(en) });

  beforeAll(async () => {
    prisma = getPrismaClient();
    svc = new OptionTypeService(prisma as PrismaService, new AuditService(prisma as PrismaService));
    const acc = await prisma.account.create({
      data: { email: `itest-opt-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    actor = { accountId: acc.id, plane: 'staff', grants: [] };
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = (
      await prisma.optionType.findMany({ where: { code: { startsWith: `itest-opt-${stamp}-` } } })
    ).map((t) => t.id);
    await prisma.$executeRawUnsafe(
      `DELETE FROM catalog.outbox WHERE aggregate_type = 'option_type' AND aggregate_id = ANY($1::text[])`,
      ids,
    );
    await prisma.optionValue.deleteMany({ where: { optionTypeId: { in: ids } } });
    await prisma.optionType.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: actor.accountId } });
    await prisma.account.deleteMany({ where: { id: actor.accountId } });
    await prisma.$disconnect();
  });

  it('creates an option type with nested values (de-duped, positioned)', async () => {
    const t = await svc.create(
      {
        code: s('color'),
        name: name('Color'),
        dataType: 'swatch',
        hasSwatch: true,
        // hex is normalised to lowercase by the contract schema; the service
        // trusts its validated input, so pass it already-normalised here.
        values: [
          { code: s('red'), label: name('Red'), swatchHex: '#ff0000' },
          { code: s('blue'), label: name('Blue'), swatchHex: '#0000ff' },
          { code: s('red'), label: name('Red again') },
        ],
      },
      actor,
      {},
    );
    expect(t.dataType).toBe('swatch');
    expect(t.values.map((v) => v.code)).toEqual([s('red'), s('blue')]);
    expect(t.values[0]?.swatchHex).toBe('#ff0000');
    expect(t.values.map((v) => v.position)).toEqual([0, 1]);
  });

  it('rejects a duplicate type code and a duplicate value code within a type', async () => {
    await svc.create({ code: s('size'), name: name('Size') }, actor, {});
    await expect(
      svc.create({ code: s('size'), name: name('Size 2') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_TYPE_CODE_TAKEN' });

    const t = await svc.create(
      {
        code: s('storage'),
        name: name('Storage'),
        values: [{ code: s('128'), label: name('128GB') }],
      },
      actor,
      {},
    );
    await expect(
      svc.addValue(t.id, { code: s('128'), label: name('128 GB') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_CODE_TAKEN' });

    // same value code under a different type is fine
    const t2 = await svc.create({ code: s('capacity'), name: name('Capacity') }, actor, {});
    await expect(
      svc.addValue(t2.id, { code: s('128'), label: name('128') }, actor, {}),
    ).resolves.toMatchObject({ id: t2.id });
  });

  it('rejects a case-variant duplicate type name and value label', async () => {
    await svc.create({ code: s('finish-a'), name: name('Finish') }, actor, {});
    await expect(
      svc.create({ code: s('finish-b'), name: name('finish') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_TYPE_NAME_TAKEN' });

    const t = await svc.create(
      {
        code: s('coating'),
        name: name('Coating'),
        values: [{ code: s('matte'), label: name('Matte') }],
      },
      actor,
      {},
    );
    await expect(
      svc.addValue(t.id, { code: s('matte-2'), label: name('MATTE') }, actor, {}),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_LABEL_TAKEN' });
  });

  it('update rejects a stale expectedUpdatedAt (optimistic concurrency) — mirrors BrandService/CategoryService', async () => {
    const t = await svc.create({ code: s('cc'), name: name('CC') }, actor, {});

    // matching token → succeeds, and bumps updatedAt
    const ok = await svc.update(
      t.id,
      { name: name('CC2'), expectedUpdatedAt: t.updatedAt },
      actor,
      {},
    );
    expect(ok.updatedAt).not.toBe(t.updatedAt);

    // the original token is now stale → 409
    await expect(
      svc.update(t.id, { name: name('CC3'), expectedUpdatedAt: t.updatedAt }, actor, {}),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // the fresh token works again; omitting it skips the check
    await expect(
      svc.update(t.id, { name: name('CC4'), expectedUpdatedAt: ok.updatedAt }, actor, {}),
    ).resolves.toMatchObject({ name: name('CC4') });
    await expect(svc.update(t.id, { status: 'deprecated' }, actor, {})).resolves.toMatchObject({
      status: 'deprecated',
    });
  });

  it('update with identical values is a no-op that does not bump updatedAt, write outbox, or audit events', async () => {
    const t = await svc.create(
      {
        code: s('noop-ot'),
        name: name('NoopOT'),
        dataType: 'select',
        hasSwatch: false,
      },
      actor,
      {},
    );

    const auditCountBefore = await prisma.auditEvent.count({
      where: { action: 'catalog.option_type_updated', targetId: t.id },
    });
    const outboxCountBefore = await prisma.catalogOutbox.count({
      where: { eventType: 'option_type.updated', aggregateId: t.id },
    });

    const noopResult = await svc.update(
      t.id,
      {
        code: s('noop-ot'),
        name: name('NoopOT'),
        dataType: 'select',
        hasSwatch: false,
        status: 'active',
        expectedUpdatedAt: t.updatedAt,
      },
      actor,
      {},
    );

    expect(noopResult.updatedAt).toBe(t.updatedAt);
    expect(noopResult.code).toBe(s('noop-ot'));

    const auditCountAfter = await prisma.auditEvent.count({
      where: { action: 'catalog.option_type_updated', targetId: t.id },
    });
    const outboxCountAfter = await prisma.catalogOutbox.count({
      where: { eventType: 'option_type.updated', aggregateId: t.id },
    });

    expect(auditCountAfter).toBe(auditCountBefore);
    expect(outboxCountAfter).toBe(outboxCountBefore);
  });

  it('updateValue reorders values by writing position directly (no dedicated reorder endpoint)', async () => {
    const t = await svc.create(
      {
        code: s('finish2'),
        name: name('Finish2'),
        values: [
          { code: s('matte2'), label: name('Matte2') },
          { code: s('gloss2'), label: name('Gloss2') },
        ],
      },
      actor,
      {},
    );
    const [first, second] = t.values;
    expect(first?.position).toBe(0);
    expect(second?.position).toBe(1);

    // swap: give the second value position 0, the first position 1
    await svc.updateValue(t.id, second!.id, { position: 0 }, actor, {});
    const reordered = await svc.updateValue(t.id, first!.id, { position: 1 }, actor, {});

    expect(reordered.values.map((v) => v.id)).toEqual([second!.id, first!.id]);
  });

  it('adds, updates (deprecate) and removes a value', async () => {
    const t = await svc.create({ code: s('carrier'), name: name('Carrier') }, actor, {});
    const withV = await svc.addValue(
      t.id,
      { code: s('verizon'), label: name('Verizon') },
      actor,
      {},
    );
    const vid = withV.values.find((v) => v.code === s('verizon'))?.id ?? '';

    const deprecated = await svc.updateValue(t.id, vid, { status: 'deprecated' }, actor, {});
    expect(deprecated.values.find((v) => v.id === vid)?.status).toBe('deprecated');

    await svc.removeValue(t.id, vid, actor, {});
    const after = await svc.get(t.id);
    expect(after.values).toHaveLength(0);
    await expect(svc.removeValue(t.id, vid, actor, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("a value's update/remove audit rows snapshot its code, not just its id — the 2026-09-17 fix", async () => {
    const t = await svc.create({ code: s('network'), name: name('Network') }, actor, {});
    const withV = await svc.addValue(t.id, { code: s('5g'), label: name('5G') }, actor, {});
    const vid = withV.values.find((v) => v.code === s('5g'))?.id ?? '';

    await svc.updateValue(t.id, vid, { code: s('5g-nsa') }, actor, {});
    const updated = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.option_type_updated', targetId: t.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(updated.before).toMatchObject({ valueId: vid, value: s('5g') });
    expect(updated.after).toMatchObject({ valueId: vid, value: s('5g-nsa') });

    await svc.removeValue(t.id, vid, actor, {});
    const removed = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'catalog.option_type_updated', targetId: t.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(removed.before).toMatchObject({ valueId: vid, value: s('5g-nsa') });
  });

  it('soft-deletes a type: gone from the default list, kept (as archived) in get + the archived list, restorable', async () => {
    const t = await svc.create({ code: s('grade'), name: name('Grade') }, actor, {});
    await svc.remove(t.id, actor, {});
    // `get()` still finds it — a pure read, no lifecycle assumption —
    // `archived: true` is the signal, not a 404. `list()` (below) is what
    // actually drops it from the live view.
    await expect(svc.get(t.id)).resolves.toMatchObject({ archived: true });

    // `.not.toContain`, not `.toHaveLength(0)`: `q` here is `s('grade')`,
    // which — tokenized — includes the `itest-opt-<stamp>` prefix every
    // fixture in this file shares, so other live rows created elsewhere in
    // this run legitimately also match under OR-token search (mirrors
    // `brand.service.integration.test.ts`'s own analogous soft-delete test).
    const { items: listed } = await svc.list({ q: s('grade') });
    expect(listed.map((x) => x.id)).not.toContain(t.id);
    const { items: archived } = await svc.list({ q: s('grade'), archived: true });
    expect(archived.map((x) => x.id)).toContain(t.id);

    const restored = await svc.restore(t.id, actor, {});
    expect(restored.id).toBe(t.id);
    await expect(svc.get(t.id)).resolves.toMatchObject({ id: t.id, archived: false });
    const { items: archivedAfter } = await svc.list({ q: s('grade'), archived: true });
    expect(archivedAfter.map((x) => x.id)).not.toContain(t.id);
  });

  it('restore is blocked when the freed name was picked up by a live row in the meantime', async () => {
    // `code` isn't tested here (mirrors `brand.service.integration.test.ts`'s
    // own equivalent test and its comment): `option_type.code` is a plain
    // `@unique` column, unconditional at the DB level regardless of
    // `deleted_at`, so a squatter can never actually pick up a freed code in
    // the first place — only name collisions are reachable here.
    const t = await svc.create({ code: s('rs-me'), name: name('rs-me') }, actor, {});
    await svc.remove(t.id, actor, {});
    const squatter = await svc.create({ code: s('rs-squatter'), name: name('rs-me') }, actor, {});
    await expect(svc.restore(t.id, actor, {})).rejects.toMatchObject({
      code: 'OPTION_TYPE_NAME_TAKEN',
    });
    await svc.update(squatter.id, { name: name('rs-squatter-2') }, actor, {});

    await expect(svc.restore(t.id, actor, {})).resolves.toMatchObject({ id: t.id });
  });

  it('q ranks by matched-token count, name and code both count — "rank 47" style query puts the fullest match first', async () => {
    const marker = `rank${stamp}`;
    const full = await svc.create(
      { code: s('rank-full'), name: { en: `${marker} Live Type 47` } },
      actor,
      {},
    );
    const partial = await svc.create(
      { code: s('rank-partial'), name: { en: `${marker} Live Type 12` } },
      actor,
      {},
    );
    // both tokens matched, but via `code` rather than `name`
    const codeOnly = await svc.create(
      { code: s(`${marker}-47-codeonly`), name: name('rank-unrelated') },
      actor,
      {},
    );
    const noMatch = await svc.create(
      { code: s('rank-no-match'), name: name('rank-nm') },
      actor,
      {},
    );

    const { items } = await svc.list({ q: `${marker} 47` });
    const ids = items.map((t) => t.id);
    // `full` (both tokens in `name`) and `codeOnly` (both tokens, via `code`)
    // tie at 2 matched tokens — which sorts first isn't under test, only
    // that both outrank `partial` (1 token: marker only)
    expect(ids.indexOf(full.id)).toBeLessThan(ids.indexOf(partial.id));
    expect(ids.indexOf(codeOnly.id)).toBeLessThan(ids.indexOf(partial.id));
    expect(ids).not.toContain(noMatch.id);
  });

  it('paginates with a cursor, code-ordered — the second page never repeats the first', async () => {
    const a = await svc.create({ code: s('page-a'), name: name('Page A') }, actor, {});
    const b = await svc.create({ code: s('page-b'), name: name('Page B') }, actor, {});

    const first = await svc.list({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();

    const second = await svc.list({
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
      limit: 1,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);

    // walking the whole list this way eventually reaches both fixtures
    // without ever repeating an id (mirrors
    // `staff-accounts.service.integration.test.ts`'s own cursor-walk test)
    const seen = new Set([first.items[0]!.id, second.items[0]!.id]);
    let cursor = second.nextCursor;
    let guard = 0;
    while (cursor && !(seen.has(a.id) && seen.has(b.id)) && guard++ < 200) {
      const page = await svc.list({ cursor, limit: 10 });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
    }
    expect(seen.has(a.id)).toBe(true);
    expect(seen.has(b.id)).toBe(true);
  });

  it('writes a catalog.outbox row per mutation', async () => {
    const t = await svc.create({ code: s('obx'), name: name('O') }, actor, {});
    await svc.update(t.id, { hasSwatch: true }, actor, {});
    await svc.addValue(t.id, { code: s('x'), label: name('X') }, actor, {});
    const rows = await prisma.catalogOutbox.findMany({ where: { aggregateId: t.id } });
    expect(rows.map((r) => r.eventType).sort()).toEqual([
      'option_type.created',
      'option_type.updated',
      'option_type.updated',
    ]);
  });
});
