'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  return roots; // items arrive ordered by (path, position), so children keep that order
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

interface RowProps {
  cat: Category;
  /** Tree metadata; omit for a flat row. */
  tree?: {
    depth: number;
    rails: boolean[]; // per ancestor: does that ancestor have a following sibling?
    isLast: boolean;
    hasChildren: boolean;
    collapsed: boolean;
    onToggle: () => void;
  };
  renderActions: (c: Category) => ReactNode;
}

function CategoryRow({ cat, tree, renderActions }: RowProps) {
  const t = useTranslations('catalog');
  const life = lifecycle(cat);
  return (
    <TableRow>
      <TableCell className="py-0 pl-1 pr-3">
        <div className="flex items-stretch">
          {tree?.rails.map((hasRail, i) => (
            <span key={i} className="relative w-4 shrink-0 self-stretch">
              {hasRail && <span className="absolute inset-y-0 left-2 w-px bg-border" />}
            </span>
          ))}
          {tree && tree.depth > 0 && (
            <span className="relative w-4 shrink-0 self-stretch">
              <span
                className={cn(
                  'absolute left-2 top-0 w-px bg-border',
                  tree.isLast ? 'h-1/2' : 'inset-y-0',
                )}
              />
              <span className="absolute left-2 top-1/2 h-px w-2 bg-border" />
            </span>
          )}
          {tree?.hasChildren ? (
            <button
              type="button"
              onClick={tree.onToggle}
              aria-label={
                tree.collapsed ? t('categories.tree.expand') : t('categories.tree.collapse')
              }
              className="my-2 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <span className="flex min-w-0 items-center gap-2 py-2.5 pl-1.5">
            <span className="truncate font-medium">{cat.name['en'] ?? cat.slug}</span>
            <span className="shrink-0 text-xs text-muted-foreground">/{cat.slug}</span>
          </span>
        </div>
      </TableCell>
      <TableCell className="w-36">
        <StatusBadge tone={brandTone(cat.brandRequirement)}>
          {t(`categories.brandReq.${cat.brandRequirement}`)}
        </StatusBadge>
      </TableCell>
      <TableCell className="w-28">
        <StatusBadge tone={life.tone}>{t(`categories.status.${life.key}`)}</StatusBadge>
      </TableCell>
      <TableCell className="w-px whitespace-nowrap text-right">{renderActions(cat)}</TableCell>
    </TableRow>
  );
}

function HeadRow() {
  const t = useTranslations('catalog');
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="pl-1">{t('categories.cols.name')}</TableHead>
        <TableHead className="w-36">{t('categories.cols.brand')}</TableHead>
        <TableHead className="w-28">{t('categories.cols.status')}</TableHead>
        <TableHead className="w-px" />
      </TableRow>
    </TableHeader>
  );
}

/**
 * Category tree as a table with connector lines and a per-row expand/collapse
 * chevron. Default: everything expanded; collapsed node ids persist in
 * `localStorage`.
 */
export function CategoryTree({
  items,
  renderActions,
}: {
  items: Category[];
  renderActions: (c: Category) => ReactNode;
}) {
  const forest = useMemo(() => buildForest(items), [items]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
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
    <Table>
      <HeadRow />
      <TableBody>
        {rows.map(({ cat, depth, rails, isLast, hasChildren }) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            tree={{
              depth,
              rails,
              isLast,
              hasChildren,
              collapsed: collapsed.has(cat.id),
              onToggle: () => toggle(cat.id),
            }}
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
  renderActions,
}: {
  items: Category[];
  renderActions: (c: Category) => ReactNode;
}) {
  return (
    <Table>
      <HeadRow />
      <TableBody>
        {items.map((cat) => (
          <CategoryRow key={cat.id} cat={cat} renderActions={renderActions} />
        ))}
      </TableBody>
    </Table>
  );
}
