'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArchiveRestore, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, CategoryListStatus } from '@shopnetic/contracts';
import { cn, notify, ScrollToTopButton, SearchInput, Skeleton } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { ScrollLoadFooter } from '@/components/crud/scroll-load-states';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useFindById } from '@/hooks/use-find-by-id';
import { useRowFlash } from '@/hooks/use-row-flash';
import { useUrlParamsSync } from '@/hooks/use-url-params-sync';
import { capForMessage } from '@/lib/format';
import { tokenize } from '@/lib/search';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { CategoryCards, CategoryFlatTable, CategoryTree } from './category-tree';
import { CategoryFormModal } from './category-form-modal';
import { applyMoveLocally, type CategoryMove } from './reorder';
import {
  deleteCategory,
  listCategories,
  listCategoriesPage,
  reorderCategories,
  restoreCategory,
} from './api';

type ModalState =
  | { mode: 'create'; parentId?: string }
  | { mode: 'edit'; category: Category }
  | null;
const STATUSES: CategoryListStatus[] = ['active', 'archived', 'all'];
const COLLAPSE_KEY = 'sn_adm_cat_collapsed';

function parseStatus(v: string | null): CategoryListStatus {
  return v === 'archived' || v === 'all' ? v : 'active';
}

// Depth per row + a name-width fraction, loosely echoing a real tree shape
// (root / child / child / grandchild / child / root) so the placeholder
// doesn't read as a generic unrelated list.
const SKELETON_ROWS = [
  { depth: 0, width: '40%' },
  { depth: 1, width: '55%' },
  { depth: 1, width: '35%' },
  { depth: 2, width: '45%' },
  { depth: 1, width: '50%' },
  { depth: 0, width: '30%' },
];

function CategoryListSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <ul>
        {SKELETON_ROWS.map((row, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-b border-border py-2 pr-3 last:border-b-0"
            style={{ paddingLeft: `${0.75 + row.depth * 1.5}rem` }}
          >
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-4" style={{ width: row.width }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryList() {
  const t = useTranslations('catalog');
  const tCommon = useTranslations('admin');

  const searchParams = useSearchParams();

  const [items, setItems] = useState<Category[] | null>(null);
  // Seeded from the URL once, at mount (same pattern as Audit Log's filter
  // sync) — a refresh or a back-button press after opening an Edit form
  // reopens on the same status tab/search instead of silently resetting to
  // Active with no query. Not re-read after that: the effect below is a
  // one-way state → URL sync, not a two-way binding.
  const [status, setStatus] = useState<CategoryListStatus>(() =>
    parseStatus(searchParams.get('status')),
  );
  const [error, setError] = useState<string | null>(null);
  // A deep link from Audit Log's Target column — `?status=all&highlight=id`
  // — always arrives with `status=all`, so it's already covered by the
  // seeding above; this is read once the same way and never re-read from
  // the URL after (the status/q-sync effect below doesn't know about it, so
  // it naturally drops out of the URL the first time that effect runs —
  // no separate cleanup needed).
  const [highlightId] = useState(() => searchParams.get('highlight'));
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedSearch(q);
  const [modal, setModal] = useState<ModalState>(null);
  const [restoreTarget, setRestoreTarget] = useState<Category | null>(null);
  const [restoring, setRestoring] = useState(false);

  useUrlParamsSync({ status: status !== 'active' ? status : undefined, q: debouncedQ });

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
  // one reorder request at a time — back-to-back drops would race on the server.
  // A drop that lands while one is in flight is remembered (latest wins) and run
  // once the in-flight one settles, so it isn't silently swallowed.
  const reordering = useRef(false);
  const pendingMove = useRef<CategoryMove | null>(null);

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
  const load = useCallback(
    (opts?: { background?: boolean }) => {
      const seq = ++loadSeq.current;
      if (!opts?.background) setError(null);
      listCategories({ status })
        .then((rows) => {
          if (seq === loadSeq.current) setItems(rows);
        })
        .catch((e: unknown) => {
          if (seq !== loadSeq.current) return;
          // A *background* refresh (post-mutation resync) that fails keeps the
          // rows already on screen — the action that kicked it off showed its
          // own error toast, and blanking a good list to an error screen
          // because a refresh didn't land is worse than slightly stale rows.
          if (opts?.background) return;
          // A *fresh* load (mount / tab switch) has nothing to preserve: show
          // the message alone, `items` stays null (not []) so "No categories
          // yet." never stacks on top of it. The user re-loads the page.
          setItems(null);
          setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
        });
    },
    [status, t],
  );
  useEffect(load, [load]);
  // switching tabs (Active/Archived/All) shows the skeleton again instead of
  // leaving the previous tab's rows frozen on screen with no feedback while
  // the new tab loads. Deliberately keyed on `status` alone, not `load` — a
  // post-mutation resync() must keep the current rows visible (H7), not flash
  // back to skeleton on every save/delete/reorder.
  useEffect(() => {
    setItems(null);
  }, [status]);

  // briefly highlight the row that was just moved / restored, so it's easy to
  // find again after the tree re-sorts. Latest flash wins; it clears itself.
  // `rescrollOn: items` — after a drag move, its undo, or a no-op drop, the
  // row can land off-screen (and scroll anchoring only follows it in one
  // direction), so this re-runs when the list reloads too, to land on the
  // row's final position, not just where it was when flash() was called.
  const { flashId, flash } = useRowFlash('data-cat-row', { rescrollOn: items });

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

  // A query bypasses the tree entirely — a size-dependent tree/flat switch
  // reads as unpredictable, drag is off during search anyway, and every
  // comparable category admin shows a flat ranked list during search (see
  // "Declined" in this feature's README). `tokenize` here is only for
  // detecting "is there a query" — the actual matching moved server-side
  // (`CategoryService.list`'s `q`, mirroring this same tokenizer) so a
  // search covers the whole table, not just whatever page is loaded.
  const searching = useMemo(() => tokenize(debouncedQ).length > 0, [debouncedQ]);
  // Archived/All (any status but the live tree) or a search → the flat,
  // paginated views. The active tree needs its whole subtree to build
  // parent/child structure, so it alone stays on the old load-all `items`.
  const isFlatMode = status !== 'active' || searching;

  const flatFetchPage = useCallback(
    (cursor: string | undefined) =>
      listCategoriesPage({
        status,
        ...(debouncedQ && searching ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.categories, nextCursor: p.nextCursor })),
    [status, debouncedQ, searching],
  );
  const flatList = useScrollLoad<Category>(
    flatFetchPage,
    [status, debouncedQ, searching],
    isFlatMode,
  );
  const flatRetry = flatList.retry;

  // Deep link landed on a specific category — keep loading pages of the
  // flat/all view until it turns up, then reuse the exact same flash/scroll
  // affordance a move or restore already gets, rather than also auto-opening
  // its edit modal: the row itself (plus the audit diff that sent someone
  // here in the first place) already says what changed.
  const highlightedCategory = useFindById(
    highlightId,
    flatList.items,
    flatList.hasMore,
    flatList.loading || flatList.loadingMore,
    flatList.loadMore,
  );
  useEffect(() => {
    if (highlightedCategory) flash(highlightedCategory.id);
  }, [highlightedCategory, flash]);

  // post-mutation reload: keeps the rows on screen if the refresh itself
  // fails (the mutation already surfaced its own error), never blanks to the
  // skeleton or the error line. Refreshes whichever data source is actually
  // driving the current view — the tree's own `items`, and/or the flat
  // paginated view when that's what's showing (a mutation reachable from a
  // flat row — restore, delete — only ever happens while it is).
  const resync = useCallback(() => {
    if (!mounted.current) return;
    load({ background: true });
    if (isFlatMode) flatRetry();
  }, [load, isFlatMode, flatRetry]);

  // Toasts and confirm-dialog copy interpolate this name into a sentence —
  // an unbounded name (FX's fixtures go past 200 chars) wraps a *fixed-width*
  // dialog into a wall of text (tmp/Restore.png). The full name is always one
  // hover/click away (the row's title, the Edit form), so cap what a message
  // embeds; a single ellipsis reads better than the dialog stretching tall.
  const labelOf = (c: Category | null | undefined): string =>
    c ? capForMessage(c.name['en'] ?? c.slug) : '';
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
      resync();
    }
  }

  async function confirmRestore(): Promise<void> {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreCategory(restoreTarget.id);
      notify.saved(t('categories.toast.restored', { name: labelOf(restoreTarget) }));
      setRestoreTarget(null);
      resync();
    } catch (e) {
      err(e);
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }

  function onSaved(action: 'created' | 'updated', c: Category): void {
    notify.saved(t(`categories.toast.${action}`, { name: labelOf(c) }));
    resync();
  }

  // ── drag reorder / reparent: apply now, offer a one-click undo, no confirm ──
  const subtreeSize = (id: string): number => {
    const c = (items ?? []).find((x) => x.id === id);
    return c ? (items ?? []).filter((x) => x.path.startsWith(`${c.path}.`)).length : 0;
  };

  async function applyMove(m: CategoryMove): Promise<void> {
    if (reordering.current) {
      // a reorder is in flight — stack this drop onto the optimistic tree and
      // remember it (latest wins); the `finally` below runs it next.
      pendingMove.current = m;
      setItems((cur) => (cur ? applyMoveLocally(cur, m) : cur));
      flash(m.movedId);
      return;
    }
    reordering.current = true;
    const snapshot = items;
    if (snapshot) setItems(applyMoveLocally(snapshot, m)); // show the move now
    flash(m.movedId);
    let ok = true;
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
      ok = false;
      if (snapshot && mounted.current) setItems(snapshot); // snap back
      reorderErrorToast(e);
    } finally {
      reordering.current = false;
      const next = pendingMove.current;
      pendingMove.current = null;
      resync();
      // run the queued drop only if this one landed — a dependent move built on
      // a reorder that failed would apply against the wrong tree.
      if (ok && next && mounted.current) void applyMove(next);
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
          className="hidden size-7 shrink-0 -translate-x-1 place-items-center rounded text-muted-foreground opacity-0 transition duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:translate-x-0 focus-visible:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 lg:grid"
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

  const flat = isFlatMode ? flatList.items : (items ?? []);
  const flatEmpty =
    !flatList.loading && !flatList.loadError && flatList.items.length === 0
      ? searching
        ? t('categories.noMatch')
        : t('categories.empty')
      : null;
  const emptyMsg = isFlatMode
    ? flatEmpty
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
        <SearchInput
          ref={searchRef}
          value={q}
          onValueChange={setQ}
          onClear={resync}
          clearLabel={tCommon('actions.clear')}
          placeholder={t('categories.searchPlaceholder')}
          className="w-full max-w-xs"
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

        {!isFlatMode && parentIds.size > 0 && (
          // only meaningful for the tree, which is md+ only (<md renders the
          // flat CategoryCards list) — hidden below md, where it would do nothing
          <ActionButton
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => setAllCollapsed(collapsed.size === 0)}
          >
            {collapsed.size === 0
              ? t('categories.tree.collapseAll')
              : t('categories.tree.expandAll')}
          </ActionButton>
        )}
      </div>

      {isFlatMode && flatList.loadError && flatList.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-6 py-10 text-sm">
          <p className="text-destructive">{tCommon('list.loadError')}</p>
          <ActionButton variant="outline" size="sm" onClick={flatList.retry}>
            {tCommon('list.retry')}
          </ActionButton>
        </div>
      ) : !isFlatMode && error !== null ? (
        <p className="px-6 py-10 text-center text-sm text-destructive">{error}</p>
      ) : isFlatMode ? (
        flatList.loading ? (
          <CategoryListSkeleton />
        ) : emptyMsg ? (
          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
        ) : (
          <>
            {/* desktop: a flat table — Archived/All, or any search */}
            <div className="hidden rounded-md border border-border md:block">
              <CategoryFlatTable
                items={flatList.items}
                renderActions={rowActions}
                flashId={flashId}
              />
            </div>
            {/* mobile: always a flat card list, parent-then-children order */}
            <div className="rounded-md border border-border md:hidden">
              <CategoryCards items={flat} renderAction={cardAction} />
            </div>
            {/* one sentinel, not duplicated per breakpoint — jsdom aside, only
                one of the two wrappers above ever actually has layout at a
                time (the other is `hidden`), so either would do; this way
                there's only ever one IntersectionObserver to keep track of. */}
            <ScrollLoadFooter
              hasMore={flatList.hasMore}
              loadingMore={flatList.loadingMore}
              loadError={flatList.loadError}
              sentinelRef={flatList.sentinelRef}
              onRetry={flatList.loadMore}
            />
          </>
        )
      ) : items === null ? (
        <CategoryListSkeleton />
      ) : emptyMsg ? (
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <>
          {/* desktop: the active tree */}
          <div className="hidden rounded-md border border-border md:block">
            <CategoryTree
              items={items}
              renderActions={rowActions}
              flashId={flashId}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              onExpandCollapsed={expandCollapsed}
              {...(canDrag ? { onReorder: applyMove, onNoop: noopMove } : {})}
            />
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
            resync();
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

      <ScrollToTopButton label={tCommon('actions.backToTop')} />
    </section>
  );
}
