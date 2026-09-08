'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveRestore, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, CategoryListStatus } from '@shopnetic/contracts';
import { cn, Input, notify } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { matchScore, tokenize } from '@/lib/search';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { CategoryCards, CategoryFlatTable, CategoryTree, type CategoryMove } from './category-tree';
import { CategoryFormModal } from './category-form-modal';
import { deleteCategory, listCategories, reorderCategories, restoreCategory } from './api';

type ModalState =
  | { mode: 'create'; parentId?: string }
  | { mode: 'edit'; category: Category }
  | null;
const STATUSES: CategoryListStatus[] = ['active', 'archived', 'all'];
const COLLAPSE_KEY = 'sn_adm_cat_collapsed';

/** ltree label for an id — uuid with the dashes stripped (matches the API). */
const ltreeLabel = (id: string): string => id.replace(/-/g, '');

/**
 * Apply a drag move to the flat list in place of a server round-trip, so the
 * tree re-renders the instant the row is dropped. `load()` reconciles with the
 * real positions right after; a failed reorder snaps back to the snapshot.
 */
function applyMoveLocally(items: Category[], m: CategoryMove): Category[] {
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

export function CategoryList() {
  const t = useTranslations('catalog');

  const [items, setItems] = useState<Category[] | null>(null);
  const [status, setStatus] = useState<CategoryListStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [modal, setModal] = useState<ModalState>(null);
  const [restoreTarget, setRestoreTarget] = useState<Category | null>(null);
  const [restoring, setRestoring] = useState(false);

  // still mounted? an undo toast outlives this page, and its `onUndo` must not
  // `setState` after the user has navigated away. Set the flag in the effect
  // body too: StrictMode dev-mounts mount→cleanup→mount, and a cleanup-only
  // reset would leave this stuck `false` — silently killing every `resync()`.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // one reorder request at a time — back-to-back drops would race on the server
  const reordering = useRef(false);

  // "/" jumps to search (unless the user is already typing somewhere)
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // drag needs a precise pointer — a touch tablet in the md–lg band falls back
  // to the Edit form's parent/position fields instead of a broken touch-drag.
  const [canDrag, setCanDrag] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const upd = (): void => setCanDrag(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // a monotonic id so an earlier, slower `load()` can't overwrite a later one
  const loadSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setError(null);
    listCategories({ status })
      .then((rows) => {
        if (seq === loadSeq.current) setItems(rows);
      })
      .catch((e: unknown) => {
        if (seq !== loadSeq.current) return;
        setItems([]);
        setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      });
  }, [status, t]);
  useEffect(load, [load]);

  const resync = useCallback(() => {
    if (mounted.current) load();
  }, [load]);

  // briefly highlight the row that was just moved / restored, so it's easy to
  // find again after the tree re-sorts. Latest flash wins; it clears itself.
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((id: string) => {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      if (mounted.current) setFlashId(null);
    }, 1400);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // keep the flashed row on screen — after a drag move, its undo, or a no-op
  // drop, the row can land off-screen (and scroll anchoring only follows it in
  // one direction). Re-runs when the list reloads so it lands on the final row.
  useEffect(() => {
    if (!flashId) return;
    document
      .querySelector(`[data-cat-row="${CSS.escape(flashId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [flashId, items]);

  // collapsed tree nodes — lifted out of CategoryTree so the toolbar's
  // expand-all / collapse-to-roots control can sit next to the search box.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const persistCollapsed = (next: Set<string>): Set<string> => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
    return next;
  };
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return persistCollapsed(next);
    });
  }, []);
  const expandCollapsed = useCallback((id: string) => {
    setCollapsed((prev) =>
      prev.has(id) ? persistCollapsed(new Set([...prev].filter((x) => x !== id))) : prev,
    );
  }, []);
  // a node is collapsible iff some row calls it parent
  const parentIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .map((c) => c.parentId)
          .filter((x): x is string => x !== null && x !== undefined),
      ),
    [items],
  );
  const setAllCollapsed = (collapse: boolean): void =>
    setCollapsed(() => persistCollapsed(collapse ? new Set(parentIds) : new Set()));

  const tokens = useMemo(() => tokenize(debouncedQ), [debouncedQ]);

  const matches = useMemo(() => {
    if (!items || tokens.length === 0) return null;
    return items
      .map((c) => ({ c, score: matchScore(`${c.name['en'] ?? ''} ${c.slug}`, tokens) }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) => b.score - a.score || (a.c.name['en'] ?? '').localeCompare(b.c.name['en'] ?? ''),
      )
      .map((r) => r.c);
  }, [items, tokens]);

  const labelOf = (c: Category | null | undefined): string => (c ? (c.name['en'] ?? c.slug) : '');
  const nameOfId = (id: string | null): string => {
    if (!id) return t('categories.form.parentNone');
    return labelOf((items ?? []).find((x) => x.id === id));
  };
  const archivedDescendants = (c: Category): number =>
    (items ?? []).filter((x) => x.archivedAt != null && x.path.startsWith(`${c.path}.`)).length;

  // Restore rejects a row whose parent is still archived (restore the parent
  // first). Archiving cascades down, so checking the direct parent is enough.
  const parentArchived = (c: Category): boolean => {
    if (!c.parentId) return false;
    const p = (items ?? []).find((x) => x.id === c.parentId);
    return p?.archivedAt != null;
  };

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  // a reorder we sent no longer fits the tree (a sibling vanished, the old
  // parent got archived…). Not a field error — just say the list refreshed.
  const reorderErrorToast = (e: unknown): void => {
    if (e instanceof AdminApiError && e.code === 'VALIDATION_ERROR') {
      notify.info(t('categories.reloadedAfterChange'));
    } else {
      err(e);
    }
  };

  // ── delete: soft (archive) + a one-click undo, no confirm dialog ───────────
  async function doDelete(c: Category): Promise<void> {
    try {
      await deleteCategory(c.id);
      notify.undo(t('categories.toast.deleted', { name: labelOf(c) }), {
        undoLabel: t('categories.undo'),
        undoneMessage: t('categories.toast.restored', { name: labelOf(c) }),
        onUndo: async () => {
          try {
            await restoreCategory(c.id);
            resync();
          } catch (e) {
            err(e); // surface the real reason (name now taken, parent archived…)
            throw e; // and skip the "restored" confirmation toast
          }
        },
      });
    } catch (e) {
      err(e);
    } finally {
      load();
    }
  }

  async function confirmRestore(): Promise<void> {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreCategory(restoreTarget.id);
      notify.saved(t('categories.toast.restored', { name: labelOf(restoreTarget) }));
      setRestoreTarget(null);
      load();
    } catch (e) {
      err(e);
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }

  function onSaved(action: 'created' | 'updated', c: Category): void {
    notify.saved(t(`categories.toast.${action}`, { name: labelOf(c) }));
    load();
  }

  // ── drag reorder / reparent: apply now, offer a one-click undo, no confirm ──
  const subtreeSize = (id: string): number => {
    const c = (items ?? []).find((x) => x.id === id);
    return c ? (items ?? []).filter((x) => x.path.startsWith(`${c.path}.`)).length : 0;
  };

  async function applyMove(m: CategoryMove): Promise<void> {
    if (reordering.current) return; // a reorder is already in flight
    reordering.current = true;
    const snapshot = items;
    if (snapshot) setItems(applyMoveLocally(snapshot, m)); // show the move now
    flash(m.movedId);
    try {
      await reorderCategories({ parentId: m.parentId, orderedIds: m.orderedIds });
      notify.undo(
        m.reparents
          ? t('categories.toast.moved', {
              name: nameOfId(m.movedId),
              count: subtreeSize(m.movedId),
            })
          : t('categories.toast.reordered'),
        {
          undoLabel: t('categories.undo'),
          undoneMessage: t('categories.toast.moveUndone'),
          onUndo: async () => {
            try {
              await reorderCategories({
                parentId: m.fromParentId,
                orderedIds: m.undoOrderedIds,
              });
              resync();
              flash(m.movedId);
            } catch (e) {
              // the tree moved on under us — can't replay the undo. Show the
              // list as it really is now rather than leaving the moved row.
              resync();
              reorderErrorToast(e);
              throw e; // skip the "Move undone." confirmation
            }
          },
        },
      );
    } catch (e) {
      if (snapshot && mounted.current) setItems(snapshot); // snap back
      reorderErrorToast(e);
    } finally {
      reordering.current = false;
      load();
    }
  }

  // a drop that resolved to the row's current position — acknowledge it so the
  // drag doesn't just vanish, and flash the row so it's clear which one.
  const noopMove = useCallback(
    (id: string) => {
      flash(id);
      notify.info(t('categories.toast.moveNoop'));
    },
    [flash, t],
  );

  const restoreCount = restoreTarget ? archivedDescendants(restoreTarget) : 0;

  // desktop row actions — labels collapse to icons in the md–lg band so the
  // name column keeps its width (Brand column is also hidden there)
  const rowActions = (c: Category) => {
    if (c.archivedAt != null) {
      const blocked = parentArchived(c);
      const restore = (
        <ActionButton
          icon={ArchiveRestore}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          disabled={blocked}
          onClick={() => setRestoreTarget(c)}
        >
          {t('categories.restore')}
        </ActionButton>
      );
      return (
        <span className="inline-flex items-center gap-1">
          {/* archived rows are view-only — this opens the same read-only modal
              the mobile card list offers */}
          <ActionButton
            icon={Eye}
            variant="ghost"
            size="sm"
            collapseLabel="lg"
            onClick={() => setModal({ mode: 'edit', category: c })}
          >
            {t('categories.view')}
          </ActionButton>
          {/* a disabled <button> eats hover events, so the "restore the parent
              first" tooltip has to live on a wrapper the pointer can reach */}
          {blocked ? (
            <span
              className="inline-flex cursor-not-allowed"
              title={t('errors.categoryParentArchived')}
            >
              {restore}
            </span>
          ) : (
            restore
          )}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          title={t('categories.addChild')}
          aria-label={t('categories.addChild')}
          onClick={() => setModal({ mode: 'create', parentId: c.id })}
          className="hidden size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 lg:grid"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <ActionButton
          icon={Pencil}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          onClick={() => setModal({ mode: 'edit', category: c })}
        >
          {t('categories.edit')}
        </ActionButton>
        <ActionButton
          icon={Trash2}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void doDelete(c)}
        >
          {t('categories.delete')}
        </ActionButton>
      </span>
    );
  };

  // mobile card action — always Edit; Delete / Restore live inside the modal
  const cardAction = (c: Category) => (
    <ActionButton
      icon={Pencil}
      variant="outline"
      size="sm"
      onClick={() => setModal({ mode: 'edit', category: c })}
    >
      {t('categories.edit')}
    </ActionButton>
  );

  const flat = matches ?? items ?? [];
  const emptyMsg =
    matches !== null && matches.length === 0
      ? t('categories.noMatch')
      : (items?.length ?? 0) === 0
        ? t('categories.empty')
        : null;

  return (
    <section>
      <PageHeader
        title={t('categories.title')}
        description={t('categories.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('categories.new')}
          </ActionButton>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('categories.searchPlaceholder')}
          className="h-9 max-w-xs"
        />
        <div className="inline-flex rounded-md border border-border p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded px-2.5 py-1 text-sm capitalize text-muted-foreground hover:text-foreground',
                status === s && 'bg-muted font-medium text-foreground',
              )}
            >
              {t(`categories.filter.${s}`)}
            </button>
          ))}
        </div>

        {matches === null && status === 'active' && parentIds.size > 0 && (
          <button
            type="button"
            onClick={() => setAllCollapsed(collapsed.size === 0)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {collapsed.size === 0
              ? t('categories.tree.collapseAll')
              : t('categories.tree.expandAll')}
          </button>
        )}
      </div>

      {error !== null && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t('categories.loading')}</p>
      ) : emptyMsg ? (
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <>
          {/* desktop: the tree (active + no search) or a flat table */}
          <div className="hidden rounded-md border border-border md:block">
            {matches !== null ? (
              <CategoryFlatTable
                items={matches}
                allCategories={items}
                renderActions={rowActions}
                flashId={flashId}
              />
            ) : status === 'active' ? (
              <CategoryTree
                items={items}
                renderActions={rowActions}
                flashId={flashId}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                onExpandCollapsed={expandCollapsed}
                {...(canDrag ? { onReorder: applyMove, onNoop: noopMove } : {})}
              />
            ) : (
              <CategoryFlatTable items={items} renderActions={rowActions} flashId={flashId} />
            )}
          </div>
          {/* mobile: always a flat card list, parent-then-children order */}
          <div className="rounded-md border border-border md:hidden">
            <CategoryCards items={flat} renderAction={cardAction} />
          </div>
        </>
      )}

      {modal !== null && (
        <CategoryFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          category={modal.mode === 'edit' ? modal.category : undefined}
          {...(modal.mode === 'create' && modal.parentId
            ? { initialParentId: modal.parentId }
            : {})}
          allCategories={(items ?? []).filter((c) => c.archivedAt == null)}
          restoreBlocked={modal.mode === 'edit' && parentArchived(modal.category)}
          onSaved={onSaved}
          onDelete={(c) => void doDelete(c)}
          onRestore={setRestoreTarget}
          onConflict={() => {
            setModal(null);
            notify.error(t('categories.editConflict'), 5000);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        tone="primary"
        title={t('categories.restoreTitle')}
        message={
          restoreCount > 0
            ? t('categories.restoreMessageWithChildren', {
                name: labelOf(restoreTarget),
                count: restoreCount,
              })
            : t('categories.restoreMessage', { name: labelOf(restoreTarget) })
        }
        confirmLabel={t('categories.restore')}
        cancelLabel={t('categories.cancel')}
        loading={restoring}
        onConfirm={confirmRestore}
      />
    </section>
  );
}
