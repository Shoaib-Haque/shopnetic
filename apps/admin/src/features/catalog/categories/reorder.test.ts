import { describe, expect, it } from 'vitest';
import type { Category } from '@shopnetic/contracts';
import { applyMoveLocally, type CategoryMove } from './reorder';

/** minimal Category — only the fields `applyMoveLocally` touches vary per test. */
function cat(
  id: string,
  parentId: string | null,
  path: string,
  depth: number,
  position: number,
): Category {
  return {
    id,
    parentId,
    slug: id,
    name: { en: id },
    path,
    depth,
    position,
    isActive: true,
    brandRequirement: 'optional',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 *  a (root)          b (root)
 *  ├─ a1             └─ b1
 *  └─ a2                └─ b1a
 */
const base = (): Category[] => [
  cat('a', null, 'a', 1, 0),
  cat('a1', 'a', 'a.a1', 2, 0),
  cat('a2', 'a', 'a.a2', 2, 1),
  cat('b', null, 'b', 1, 1),
  cat('b1', 'b', 'b.b1', 2, 0),
  cat('b1a', 'b1', 'b.b1.b1a', 3, 0),
];

const pick = (items: Category[], id: string): Category => {
  const c = items.find((x) => x.id === id);
  if (!c) throw new Error(`no ${id}`);
  return c;
};

const emptyMove: CategoryMove = {
  parentId: null,
  orderedIds: [],
  movedId: '',
  fromParentId: null,
  reparents: false,
  undoOrderedIds: [],
};

describe('applyMoveLocally', () => {
  it('renumbers siblings on a pure reorder, leaves paths and parents alone', () => {
    const m: CategoryMove = {
      parentId: 'a',
      orderedIds: ['a2', 'a1'],
      movedId: 'a2',
      fromParentId: 'a',
      reparents: false,
      undoOrderedIds: ['a1', 'a2'],
    };
    const out = applyMoveLocally(base(), m);
    expect(pick(out, 'a2').position).toBe(0);
    expect(pick(out, 'a1').position).toBe(1);
    expect(pick(out, 'a2').parentId).toBe('a');
    expect(pick(out, 'a2').path).toBe('a.a2');
  });

  it('reparents a leaf — new parent, path, depth, position; old parent renumbered', () => {
    const m: CategoryMove = {
      parentId: 'b',
      orderedIds: ['a2', 'b1'],
      movedId: 'a2',
      fromParentId: 'a',
      reparents: true,
      undoOrderedIds: ['a1', 'a2'],
    };
    const out = applyMoveLocally(base(), m);
    const a2 = pick(out, 'a2');
    expect(a2.parentId).toBe('b');
    expect(a2.path).toBe('b.a2');
    expect(a2.depth).toBe(2); // b is depth 1
    expect(a2.position).toBe(0);
    expect(pick(out, 'b1').position).toBe(1);
    expect(pick(out, 'a1').position).toBe(0); // left behind, renumbered from undoOrderedIds
  });

  it('re-roots a whole subtree when its ancestor moves', () => {
    // move b1 (with child b1a) under a, at the end
    const m: CategoryMove = {
      parentId: 'a',
      orderedIds: ['a1', 'a2', 'b1'],
      movedId: 'b1',
      fromParentId: 'b',
      reparents: true,
      undoOrderedIds: ['b1'],
    };
    const out = applyMoveLocally(base(), m);
    expect(pick(out, 'b1').path).toBe('a.b1');
    expect(pick(out, 'b1').position).toBe(2);
    expect(pick(out, 'b1a').path).toBe('a.b1.b1a'); // descendant rides along
    // a (depth 1) and b (depth 1) → no depth shift for this move
    expect(pick(out, 'b1').depth).toBe(2);
    expect(pick(out, 'b1a').depth).toBe(3);
  });

  it('shifts depth when the move changes nesting level', () => {
    // move a1 under b1a (depth 3) → a1 goes from depth 2 to depth 4
    const m: CategoryMove = {
      parentId: 'b1a',
      orderedIds: ['a1'],
      movedId: 'a1',
      fromParentId: 'a',
      reparents: true,
      undoOrderedIds: ['a1', 'a2'],
    };
    const a1 = pick(applyMoveLocally(base(), m), 'a1');
    expect(a1.path).toBe('b.b1.b1a.a1');
    expect(a1.depth).toBe(4);
  });

  it('is idempotent — applying the same move twice equals applying it once', () => {
    const m: CategoryMove = {
      parentId: 'a',
      orderedIds: ['a1', 'a2', 'b1'],
      movedId: 'b1',
      fromParentId: 'b',
      reparents: true,
      undoOrderedIds: ['b1'],
    };
    const once = applyMoveLocally(base(), m);
    const twice = applyMoveLocally(once, m);
    expect(twice).toEqual(once);
  });

  it('returns the input untouched when the move is stale', () => {
    const items = base();
    expect(applyMoveLocally(items, { ...emptyMove, movedId: 'ghost' })).toBe(items);
    expect(applyMoveLocally(items, { ...emptyMove, movedId: 'a2', parentId: 'ghost-parent' })).toBe(
      items,
    );
  });
});
