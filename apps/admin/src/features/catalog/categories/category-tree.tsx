'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
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

/**
 * Category tree rendered as a table with connector lines and a per-row
 * expand/collapse toggle. Default: everything expanded; collapsed node ids
 * persist in `localStorage`.
 */
export function CategoryTree({
  items,
  renderActions,
}: {
  items: Category[];
  renderActions: (c: Category) => ReactNode;
}) {
  const t = useTranslations('catalog');
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

  interface Row {
    cat: Category;
    depth: number;
    rails: boolean[]; // per ancestor level: does that ancestor have a following sibling?
    isLast: boolean;
    hasChildren: boolean;
  }
  const rows: Row[] = [];
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
      <TableHeader>
        <TableRow>
          <TableHead>{t('categories.cols.name')}</TableHead>
          <TableHead className="w-36">{t('categories.cols.brand')}</TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ cat, depth, rails, isLast, hasChildren }) => (
          <TableRow key={cat.id}>
            <TableCell className="py-0">
              <div className="flex items-stretch">
                {rails.map((hasRail, i) => (
                  <span key={i} className="relative w-5 shrink-0 self-stretch">
                    {hasRail && <span className="absolute inset-y-0 left-2.5 w-px bg-border" />}
                  </span>
                ))}
                {depth > 0 && (
                  <span className="relative w-5 shrink-0 self-stretch">
                    <span
                      className={cn(
                        'absolute left-2.5 top-0 w-px bg-border',
                        isLast ? 'h-1/2' : 'inset-y-0',
                      )}
                    />
                    <span className="absolute left-2.5 top-1/2 h-px w-2.5 bg-border" />
                  </span>
                )}
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(cat.id)}
                    aria-label={
                      collapsed.has(cat.id)
                        ? t('categories.tree.expand')
                        : t('categories.tree.collapse')
                    }
                    className="my-2 grid size-5 shrink-0 place-items-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {collapsed.has(cat.id) ? (
                      <Plus className="size-3" aria-hidden />
                    ) : (
                      <Minus className="size-3" aria-hidden />
                    )}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <span className="flex min-w-0 items-center gap-2 py-2.5 pl-2">
                  <span className="truncate font-medium">{cat.name['en'] ?? cat.slug}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">/{cat.slug}</span>
                  {!cat.isActive && (
                    <StatusBadge tone="neutral">{t('categories.inactive')}</StatusBadge>
                  )}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge tone={brandTone(cat.brandRequirement)}>
                {t(`categories.brandReq.${cat.brandRequirement}`)}
              </StatusBadge>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">{renderActions(cat)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
