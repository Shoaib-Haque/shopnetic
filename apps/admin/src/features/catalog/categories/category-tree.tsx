'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import {
  cn,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type StatusTone,
} from '@shopnetic/ui';

const STORAGE_KEY = 'sn_adm_cat_collapsed';

interface Node {
  cat: Category;
  children: Node[];
}

function buildForest(items: Category[]): Node[] {
  const byId = new Map<string, Node>();
  for (const cat of items) byId.set(cat.id, { cat, children: [] });
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const parent = node.cat.parentId ? byId.get(node.cat.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  // `list` sorts by the ltree path (uuid labels), so sibling order is by
  // `position` only after this pass. Name breaks ties deterministically.
  const order = (a: Node, b: Node): number =>
    a.cat.position - b.cat.position ||
    (a.cat.name['en'] ?? a.cat.slug).localeCompare(b.cat.name['en'] ?? b.cat.slug);
  roots.sort(order);
  for (const node of byId.values()) node.children.sort(order);
  return roots;
}

/**
 * `(c) => "Fashion › Men's Clothing"` — the ancestor chain of a row, resolved
 * from its ltree `path` against `pool`. Used where the indentation can't carry
 * the context: the mobile cards, and the flat table (search / archived views).
 * Labels that don't resolve in `pool` are skipped, so a partial chain is fine.
 */
function useAncestorPath(pool: Category[]): (c: Category) => string {
  const nameByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of pool) m.set(c.id.replace(/-/g, ''), c.name['en'] ?? c.slug);
    return m;
  }, [pool]);
  return useCallback(
    (c: Category): string =>
      c.path
        .split('.')
        .slice(0, -1)
        .map((l) => nameByLabel.get(l))
        .filter(Boolean)
        .join(' › '),
    [nameByLabel],
  );
}

const brandTone = (r: Category['brandRequirement']): StatusTone =>
  r === 'required' ? 'warning' : r === 'none' ? 'neutral' : 'success';

interface Lifecycle {
  tone: StatusTone;
  key: 'active' | 'inactive' | 'archived';
}
const lifecycle = (c: Category): Lifecycle =>
  c.archivedAt != null
    ? { tone: 'danger', key: 'archived' }
    : !c.isActive
      ? { tone: 'warning', key: 'inactive' }
      : { tone: 'success', key: 'active' };

type DropZone = 'before' | 'inside' | 'after';

interface RowProps {
  cat: Category;
  /** Ancestor chain ("A › B"), shown under the name when the row isn't indented. */
  context?: string;
  /** Briefly highlight this row — it was just moved / restored. */
  flash?: boolean;
  /** Tree metadata; omit for a flat row. */
  tree?: {
    depth: number;
    /** One flag per ancestor level: does that ancestor have a following sibling? */
    rails: boolean[];
    /** Is this the last child of its parent? (no spine continues below its elbow) */
    isLast: boolean;
    hasChildren: boolean;
    collapsed: boolean;
    onToggle: () => void;
  };
  /** Drag-reorder wiring; omit to make the row static. */
  drag?: {
    dragging: boolean;
    hint: DropZone | null;
    onDragStart: (e: DragEvent<HTMLTableRowElement>) => void;
    onDragOver: (e: DragEvent<HTMLTableRowElement>) => void;
    onDragLeave: (e: DragEvent<HTMLTableRowElement>) => void;
    onDrop: (e: DragEvent<HTMLTableRowElement>) => void;
    onDragEnd: (e: DragEvent<HTMLTableRowElement>) => void;
  };
  renderActions: (c: Category) => ReactNode;
}

/** Left inset of the name cell, and one indent level (== the chevron's `size-5`). */
const PAD = 8;
const STEP = 20;
/** Radius of the terminal elbow corner (kept small — just softens the turn). */
const R = 3;
/** Connector colour — a touch darker than `border` so the guides read clearly. */
const LINE = 'bg-muted-foreground/30';
const EDGE = 'border-muted-foreground/30';

/**
 * Connector guides drawn as an absolutely-positioned layer that fills the whole
 * `<td>` (which is always the full row height), so verticals meet across the row
 * border instead of being clipped inside a flex box. `top/bottom: -1` bridges
 * the 1px row border. `x(level)` is the centre of that level's chevron slot.
 *
 * The vertical is always a plain straight line to (or through) the elbow centre —
 * only the last `R`px is swapped for a bordered arc on a terminal elbow, so the
 * parent→child link renders identically whether or not the child is last.
 */
function TreeGuides({ tree }: { tree: NonNullable<RowProps['tree']> }) {
  const x = (level: number): number => PAD + level * STEP + STEP / 2;
  const parent = tree.depth - 1;
  const px = x(parent);
  const hEnd = tree.hasChildren ? PAD + parent * STEP + STEP : PAD + tree.depth * STEP;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* ancestor spines that pass straight through this row. `rails[k]` is
          "ancestor at depth k has a later sibling"; the guide for indent column
          `i` continues past this row only if the ancestor one level deeper
          (`rails[i + 1]`) has more children below — hence `slice(1)`. */}
      {tree.rails
        .slice(1)
        .map((on, i) =>
          on ? (
            <span
              key={i}
              className={cn('absolute w-px', LINE)}
              style={{ left: x(i), top: -1, bottom: -1 }}
            />
          ) : null,
        )}
      {tree.depth > 0 && (
        <>
          {/* vertical: full-height for a through elbow, stops `R`px short for a
              terminal one so the arc can round the corner */}
          <span
            className={cn('absolute w-px', LINE)}
            style={{ left: px, top: -1, bottom: tree.isLast ? `calc(50% + ${R}px)` : -1 }}
          />
          {tree.isLast && (
            <span
              className={cn('absolute rounded-bl-[3px] border-b border-l', EDGE)}
              style={{ left: px, top: `calc(50% - ${R}px)`, height: R, width: R + 3 }}
            />
          )}
          {/* centre → the toggle / label */}
          <span
            className={cn('absolute h-px', LINE)}
            style={{
              left: tree.isLast ? px + R : px,
              top: '50%',
              width: hEnd - (tree.isLast ? px + R : px),
            }}
          />
        </>
      )}
      {/* this row's own spine down to its first child */}
      {tree.hasChildren && !tree.collapsed && (
        <span
          className={cn('absolute w-px', LINE)}
          style={{ left: x(tree.depth), top: '50%', bottom: -1 }}
        />
      )}
    </div>
  );
}

function CategoryRow({ cat, context, flash, tree, drag, renderActions }: RowProps) {
  const t = useTranslations('catalog');
  const life = lifecycle(cat);
  const label = cat.name['en'] ?? cat.slug;
  return (
    <TableRow
      className={cn(
        drag && 'cursor-grab select-none',
        drag?.dragging && 'opacity-40',
        drag?.hint === 'inside' && 'bg-primary/10',
        flash && 'sn-row-flash',
      )}
      {...(drag
        ? {
            draggable: true,
            onDragStart: drag.onDragStart,
            onDragOver: drag.onDragOver,
            onDragLeave: drag.onDragLeave,
            onDrop: drag.onDrop,
            onDragEnd: drag.onDragEnd,
          }
        : {})}
    >
      <TableCell className="relative p-0">
        {tree && <TreeGuides tree={tree} />}
        {drag?.hint === 'before' && (
          <span className="absolute inset-x-0 top-0 z-10 h-0.5 bg-primary" aria-hidden />
        )}
        {drag?.hint === 'after' && (
          <span className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary" aria-hidden />
        )}
        <div
          className="relative flex min-w-0 items-center overflow-hidden py-2 pr-3"
          style={{ paddingLeft: PAD + (tree ? tree.depth * STEP : 0) }}
        >
          {tree?.hasChildren ? (
            <button
              type="button"
              onClick={tree.onToggle}
              aria-label={
                tree.collapsed ? t('categories.tree.expand') : t('categories.tree.collapse')
              }
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {tree.collapsed ? (
                <ChevronRight className="size-4" aria-hidden />
              ) : (
                <ChevronDown className="size-4" aria-hidden />
              )}
            </button>
          ) : tree ? (
            <span className="w-5 shrink-0" />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col pl-1.5">
            <span className="truncate" title={`${label} /${cat.slug}`}>
              <span className="font-medium">{label}</span>
              <span className="ml-2 text-xs text-muted-foreground">/{cat.slug}</span>
            </span>
            {context ? (
              <span className="truncate text-xs text-muted-foreground" title={context}>
                {t('categories.inPath', { path: context })}
              </span>
            ) : null}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden w-36 lg:table-cell">
        <StatusBadge tone={brandTone(cat.brandRequirement)}>
          {t(`categories.brandReq.${cat.brandRequirement}`)}
        </StatusBadge>
      </TableCell>
      <TableCell className="w-28">
        <StatusBadge tone={life.tone}>{t(`categories.status.${life.key}`)}</StatusBadge>
      </TableCell>
      <TableCell className="w-20 whitespace-nowrap text-right lg:w-48">
        {renderActions(cat)}
      </TableCell>
    </TableRow>
  );
}

function HeadRow() {
  const t = useTranslations('catalog');
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="pl-2">{t('categories.cols.name')}</TableHead>
        <TableHead className="hidden w-36 lg:table-cell">{t('categories.cols.brand')}</TableHead>
        <TableHead className="w-28">{t('categories.cols.status')}</TableHead>
        <TableHead className="w-20 lg:w-48" />
      </TableRow>
    </TableHeader>
  );
}

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

/**
 * Category tree as a table with connector lines and a per-row expand/collapse
 * chevron. Default: everything expanded; collapsed node ids persist in
 * `localStorage`.
 *
 * Pass `onReorder` to make rows drag-reorderable (desktop only — the drag handle
 * is hidden below `sm`): drop on the top third of a row to place before it, the
 * bottom third for after, the middle to nest inside.
 */
export function CategoryTree({
  items,
  renderActions,
  onReorder,
  flashId,
}: {
  items: Category[];
  renderActions: (c: Category) => ReactNode;
  onReorder?: (move: CategoryMove) => void;
  /** id of a row to briefly highlight (just moved / restored). */
  flashId?: string | null;
}) {
  const forest = useMemo(() => buildForest(items), [items]);

  const catById = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Category[]>();
    const visit = (nodes: Node[], pid: string | null): void => {
      m.set(
        pid,
        nodes.map((n) => n.cat),
      );
      for (const n of nodes) visit(n.children, n.cat.id);
    };
    visit(forest, null);
    return m;
  }, [forest]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ id: string; zone: DropZone } | null>(null);

  const dragHandlers = (cat: Category): NonNullable<RowProps['drag']> => {
    const insideOwnSubtree = (targetPath: string): boolean => {
      const dragged = dragId ? catById.get(dragId) : undefined;
      return !!dragged && targetPath.startsWith(`${dragged.path}.`);
    };
    return {
      dragging: dragId === cat.id,
      hint: hint?.id === cat.id ? hint.zone : null,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cat.id);
        setDragId(cat.id);
      },
      onDragOver: (e) => {
        if (!dragId || dragId === cat.id || insideOwnSubtree(cat.path)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        const rel = (e.clientY - r.top) / r.height;
        const zone: DropZone = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
        setHint((h) => (h?.id === cat.id && h.zone === zone ? h : { id: cat.id, zone }));
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) {
          setHint((h) => (h?.id === cat.id ? null : h));
        }
      },
      onDrop: (e) => {
        e.preventDefault();
        const id = dragId;
        const drop = hint;
        setDragId(null);
        setHint(null);
        if (!id || !drop || id === cat.id) return;
        const dragged = catById.get(id);
        const target = catById.get(cat.id);
        if (!dragged || !target || target.path.startsWith(`${dragged.path}.`)) return;

        let parentId: string | null;
        let siblings: Category[];
        if (drop.zone === 'inside') {
          parentId = target.id;
          siblings = (childrenOf.get(target.id) ?? []).filter((c) => c.id !== id);
          siblings.push(dragged);
        } else {
          parentId = target.parentId ?? null;
          siblings = (childrenOf.get(parentId) ?? []).filter((c) => c.id !== id);
          const idx = siblings.findIndex((c) => c.id === target.id);
          siblings.splice(drop.zone === 'before' ? idx : idx + 1, 0, dragged);
        }
        const orderedIds = siblings.map((c) => c.id);
        const fromParentId = dragged.parentId ?? null;
        const currentIds = (childrenOf.get(parentId) ?? []).map((c) => c.id);
        const unchanged =
          fromParentId === parentId &&
          currentIds.length === orderedIds.length &&
          currentIds.every((v, i) => v === orderedIds[i]);
        if (unchanged) return;
        if (drop.zone === 'inside') expand(target.id);
        onReorder?.({
          parentId,
          orderedIds,
          movedId: id,
          fromParentId,
          reparents: fromParentId !== parentId,
          undoOrderedIds: (childrenOf.get(fromParentId) ?? []).map((c) => c.id),
        });
      },
      onDragEnd: () => {
        setDragId(null);
        setHint(null);
      },
    };
  };

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Set<string>): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }, []);

  // one-way: reveal a node's children after something is dropped inside it,
  // otherwise the moved row lands out of sight under a still-collapsed parent.
  const expand = useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persist(next);
      return next;
    });
  }, []);

  interface Flat {
    cat: Category;
    depth: number;
    rails: boolean[];
    isLast: boolean;
    hasChildren: boolean;
  }
  const rows: Flat[] = [];
  const walk = (nodes: Node[], depth: number, rails: boolean[]): void => {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const hasChildren = node.children.length > 0;
      rows.push({ cat: node.cat, depth, rails, isLast, hasChildren });
      if (hasChildren && !collapsed.has(node.cat.id)) {
        walk(node.children, depth + 1, [...rails, !isLast]);
      }
    });
  };
  walk(forest, 0, []);

  return (
    <Table className="table-fixed">
      <HeadRow />
      <TableBody>
        {rows.map(({ cat, depth, rails, isLast, hasChildren }) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            flash={cat.id === flashId}
            tree={{
              depth,
              rails,
              isLast,
              hasChildren,
              collapsed: collapsed.has(cat.id),
              onToggle: () => toggle(cat.id),
            }}
            {...(onReorder ? { drag: dragHandlers(cat) } : {})}
            renderActions={renderActions}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/** Flat (non-nested) variant — used for search results and archived / all views. */
export function CategoryFlatTable({
  items,
  allCategories,
  renderActions,
  flashId,
}: {
  items: Category[];
  /** name-resolution pool for the "in A › B" line — pass the full list when
   *  `items` is a filtered subset (search), so ancestors still resolve. */
  allCategories?: Category[];
  renderActions: (c: Category) => ReactNode;
  flashId?: string | null;
}) {
  const ancestorPath = useAncestorPath(allCategories ?? items);
  return (
    <Table className="table-fixed">
      <HeadRow />
      <TableBody>
        {items.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            context={ancestorPath(cat)}
            flash={cat.id === flashId}
            renderActions={renderActions}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Mobile flat list — no tree, no drag. Rows arrive in `path` order so a parent
 * sits just above its children; a muted "in X › Y" line gives the context the
 * indentation would on desktop.
 */
export function CategoryCards({
  items,
  renderAction,
}: {
  items: Category[];
  renderAction: (c: Category) => ReactNode;
}) {
  const t = useTranslations('catalog');
  const contextOf = useAncestorPath(items);

  return (
    <ul className="divide-y divide-border">
      {items.map((c) => {
        const life = lifecycle(c);
        const ctx = contextOf(c);
        return (
          <li key={c.id} className="flex items-start gap-3 px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={`${c.name['en'] ?? c.slug} /${c.slug}`}>
                {c.name['en'] ?? c.slug}
                <span className="ml-2 text-xs font-normal text-muted-foreground">/{c.slug}</span>
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t(`categories.status.${life.key}`)} ·{' '}
                {t(`categories.brandReq.${c.brandRequirement}`)}
                {ctx ? ` · ${t('categories.inPath', { path: ctx })}` : ''}
              </p>
            </div>
            <div className="shrink-0">{renderAction(c)}</div>
          </li>
        );
      })}
    </ul>
  );
}
