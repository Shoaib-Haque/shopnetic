import type { Category } from '@shopnetic/contracts';

/** What a completed drag hands back — enough to apply it, confirm it, and undo it. */
export interface CategoryMove {
  /** new parent (root when null) and its full child order after the move */
  parentId: string | null;
  orderedIds: string[];
  movedId: string;
  fromParentId: string | null;
  /** true when the drop changed the parent (structural — worth a confirm) */
  reparents: boolean;
  /** the child order of `fromParentId` *before* the move, for one-click undo */
  undoOrderedIds: string[];
}

/** ltree label for an id — uuid with the dashes stripped (matches the API). */
export const ltreeLabel = (id: string): string => id.replace(/-/g, '');

/**
 * Apply a drag move to the flat list in place of a server round-trip, so the
 * tree re-renders the instant the row is dropped. `load()` reconciles with the
 * real positions right after; a failed reorder snaps back to the pre-drop
 * snapshot. Pure, and **idempotent** — applying the same move twice equals
 * applying it once, which is what makes the queued-drop re-apply safe.
 */
export function applyMoveLocally(items: Category[], m: CategoryMove): Category[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const moved = byId.get(m.movedId);
  if (!moved) return items;
  const newParent = m.parentId ? byId.get(m.parentId) : null;
  if (m.parentId && !newParent) return items; // stale target — let the refetch sort it

  const newBasePath = newParent
    ? `${newParent.path}.${ltreeLabel(moved.id)}`
    : ltreeLabel(moved.id);
  const oldPrefix = `${moved.path}.`;
  const depthDelta = (newParent ? newParent.depth + 1 : 0) - moved.depth;

  const posInNew = new Map(m.orderedIds.map((id, i) => [id, i]));
  const posInOld = new Map(
    m.undoOrderedIds.filter((id) => id !== m.movedId).map((id, i) => [id, i]),
  );

  return items.map((c) => {
    if (c.id === m.movedId) {
      return {
        ...c,
        parentId: m.parentId,
        position: posInNew.get(c.id) ?? c.position,
        path: newBasePath,
        depth: c.depth + depthDelta,
      };
    }
    if (c.path.startsWith(oldPrefix)) {
      // a descendant rides along — re-root its path, shift its depth
      return {
        ...c,
        path: newBasePath + '.' + c.path.slice(oldPrefix.length),
        depth: c.depth + depthDelta,
      };
    }
    const np = posInNew.get(c.id);
    if (np !== undefined) return { ...c, position: np };
    const op = posInOld.get(c.id);
    if (op !== undefined) return { ...c, position: op };
    return c;
  });
}
