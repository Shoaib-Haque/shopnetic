'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Brand, BrandStatus } from '@shopnetic/contracts';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  notify,
  ScrollToTopButton,
  SearchInput,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type StatusTone,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { ScrollLoadFooter, ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useSoftDeleteWithUndo } from '@/components/crud/use-soft-delete-with-undo';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useFindById } from '@/hooks/use-find-by-id';
import { useRowFlash } from '@/hooks/use-row-flash';
import { useUrlParamsSync } from '@/hooks/use-url-params-sync';
import { capForMessage } from '@/lib/format';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { BrandFormModal } from './brand-form-modal';
import { BrandMergeDialog } from './brand-merge-dialog';
import { deleteBrand, listBrandsPage, restoreBrand } from './api';

type Tab = 'live' | 'archived';
const TABS: Tab[] = ['live', 'archived'];
const STATUS_FILTERS: Array<BrandStatus | 'all'> = ['all', 'pending', 'active', 'rejected'];

const STATUS_TONE: Record<BrandStatus, StatusTone> = {
  active: 'success',
  pending: 'warning',
  rejected: 'danger',
};

function parseTab(v: string | null): Tab {
  return v === 'archived' ? 'archived' : 'live';
}
function parseStatusFilter(v: string | null): BrandStatus | 'all' {
  return v === 'pending' || v === 'active' || v === 'rejected' ? v : 'all';
}

type ModalState = { mode: 'create' } | { mode: 'edit'; brand: Brand } | null;

export function BrandList() {
  const t = useTranslations('catalog');
  const tCommon = useTranslations('admin');
  const searchParams = useSearchParams();

  // seeded from the URL once at mount, same one-way sync pattern Categories
  // and Audit Log use — a refresh / back-button reopens on the same
  // tab/filter/search instead of resetting.
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')));
  const [statusFilter, setStatusFilter] = useState<BrandStatus | 'all'>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const [highlightId] = useState(() => searchParams.get('highlight'));
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedSearch(q);

  useUrlParamsSync({
    tab: tab !== 'live' ? tab : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    q: debouncedQ,
  });

  const [modal, setModal] = useState<ModalState>(null);
  const [mergeSource, setMergeSource] = useState<Brand | null>(null);

  // still mounted? an undo toast outlives this page (same reasoning as
  // Category List's own guard).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listBrandsPage({
        archived: tab === 'archived',
        // The status dropdown only renders on the Live tab (below), but its
        // last-picked value stayed in state — gated here too so a filter
        // chosen before switching to Archived doesn't silently keep
        // applying to a query the UI no longer shows it for.
        ...(tab === 'live' && statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.brands, nextCursor: p.nextCursor })),
    [tab, statusFilter, debouncedQ],
  );
  const list = useScrollLoad<Brand>(fetchPage, [tab, statusFilter, debouncedQ]);

  // deep link from Audit Log's Target column — keeps loading pages until the
  // row turns up (only ever finds it on the live tab; see audit-log.tsx's
  // own comment on this limitation), then flashes it in place.
  const highlighted = useFindById(
    highlightId,
    list.items,
    list.hasMore,
    list.loading || list.loadingMore,
    list.loadMore,
  );
  const { flashId, flash } = useRowFlash('data-brand-row');
  useEffect(() => {
    if (highlighted) flash(highlighted.id);
  }, [highlighted, flash]);

  // `refresh`, not `retry` — this list has no separate unpaginated data
  // source with its own background-safe loader (Category's tree does; this
  // is always the flat/paginated view), so a post-mutation resync needs the
  // in-place, no-flash refetch or every action blanks the whole list before
  // showing it again.
  const listRefresh = list.refresh;
  const resync = useCallback(() => {
    if (!mounted.current) return;
    listRefresh();
  }, [listRefresh]);

  const labelOf = (b: Brand | null | undefined): string => (b ? capForMessage(b.name) : '');

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  const { doDelete, restoreTarget, setRestoreTarget, restoring, confirmRestore } =
    useSoftDeleteWithUndo<Brand>({
      deleteItem: deleteBrand,
      restoreItem: restoreBrand,
      resync,
      labelOf,
      onError: err,
      messages: {
        deleted: (name) => t('brands.toast.deleted', { name }),
        restored: (name) => t('brands.toast.restored', { name }),
        alreadyDeleted: (name) => t('brands.alreadyDeleted', { name }),
        alreadyRestored: (name) => t('brands.alreadyRestored', { name }),
        undoLabel: t('brands.undo'),
      },
    });

  function onSaved(action: 'created' | 'updated', b: Brand): void {
    notify.saved(t(`brands.toast.${action}`, { name: labelOf(b) }));
    resync();
  }

  function onMerged(source: Brand, target: Brand): void {
    notify.saved(t('brands.toast.merged', { name: labelOf(source), target: labelOf(target) }));
    setMergeSource(null);
    resync();
  }

  const emptyMsg =
    !list.loading && !list.loadError && list.items.length === 0
      ? debouncedQ
        ? t('brands.noMatch')
        : t('brands.empty')
      : null;

  // `isRestricted` is orthogonal to `status` (a restricted brand is often
  // still `active`) — a second colored badge stacked next to the status
  // one read as two competing states at a glance (the 2026-09-18 fix).
  // A small icon by the name, matching how a "flagged"/"verified" marker
  // usually sits next to a title rather than in a status column, keeps
  // Status down to the one badge it's actually about. Sits *after* the
  // name (not before — a follow-up fix): a leading icon staggered every
  // restricted row's name start out of line with the rest; trailing +
  // `shrink-0` in a flex row instead means the name/slug text is what
  // truncates to make room, so a restricted row costs exactly the same
  // total width as a plain one, never more.
  const restrictedIcon = (b: Brand): ReactNode =>
    b.isRestricted ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <ShieldAlert
            className="inline-block size-3.5 shrink-0 align-text-bottom text-warning"
            aria-label={t('brands.restrictedHint')}
          />
        </TooltipTrigger>
        <TooltipContent>{t('brands.restrictedHint')}</TooltipContent>
      </Tooltip>
    ) : null;

  // Always the "…" menu, never direct buttons — one rule for every row,
  // no per-page judgment call on how many actions is "too many" (matching
  // Staff List's own `renderMenu`, the 2026-09-18 fix; it also permanently
  // rules out the row-actions-crowd-the-border bug a fixed-width icon
  // column had before, regardless of how many actions a row ends up with).
  const rowMenu = (b: Brand): ReactNode => (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label={tCommon('actions.more')}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tCommon('actions.more')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        {tab === 'archived' ? (
          <DropdownMenuItem onSelect={() => setRestoreTarget(b)}>
            {t('brands.restore')}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', brand: b })}>
              {t('brands.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMergeSource(b)}>
              {t('brands.merge')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void doDelete(b)}
              className="text-destructive focus:text-destructive"
            >
              {t('brands.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section>
      <PageHeader
        title={t('brands.title')}
        description={t('brands.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('brands.new')}
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
          placeholder={t('brands.searchPlaceholder')}
          className="w-full max-w-xs"
        />
        <div className="inline-flex rounded-md border border-border p-0.5">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={cn(
                'rounded px-2.5 py-1 text-sm capitalize text-muted-foreground hover:text-foreground',
                tab === tb && 'bg-muted font-medium text-foreground',
              )}
            >
              {t(`brands.filter.${tb}`)}
            </button>
          ))}
        </div>
        {tab === 'live' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BrandStatus | 'all')}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`brands.statusFilter.${s}`)}
              </option>
            ))}
          </select>
        )}
      </div>

      {list.loadError && list.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-6 py-10 text-sm">
          <p className="text-destructive">{tCommon('list.loadError')}</p>
          <ActionButton variant="outline" size="sm" onClick={list.retry}>
            {tCommon('list.retry')}
          </ActionButton>
        </div>
      ) : list.loading ? (
        <ScrollLoadSkeleton />
      ) : emptyMsg ? (
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <>
          <div className="hidden rounded-md border border-border md:block">
            <Table className="table-fixed" scrollX={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-2">{t('brands.cols.name')}</TableHead>
                  <TableHead className="w-28">{t('brands.cols.status')}</TableHead>
                  <TableHead className="hidden w-32 lg:table-cell">
                    {t('brands.cols.aliases')}
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((b) => (
                  <TableRow
                    key={b.id}
                    data-brand-row={b.id}
                    className={cn('scroll-my-24', b.id === flashId && 'sn-row-flash')}
                  >
                    <TableCell className="pl-2">
                      {/* name (`flex-initial` — shrinks under real
                       * pressure, but never *grows* into unused space the
                       * way `flex-1` did; a short name now sits right next
                       * to the badge instead of stretching the badge/slug
                       * off to the far right), badge (shrink-0, always
                       * visible), /slug (still its own truncate — free to
                       * shrink away under real pressure exactly like
                       * before, no new guarantee added for it, only for
                       * the badge). */}
                      <div
                        className="flex min-w-0 items-center gap-1"
                        title={`${b.name} /${b.slug}`}
                      >
                        <span className="min-w-0 flex-initial truncate font-medium">{b.name}</span>
                        {restrictedIcon(b)}
                        <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
                          /{b.slug}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_TONE[b.status]}>
                        {t(`brands.status.${b.status}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {b.aliases.length}
                    </TableCell>
                    <TableCell>{rowMenu(b)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* mobile: a flat card list */}
          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {list.items.map((b) => (
              <li key={b.id} data-brand-row={b.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1" title={`${b.name} /${b.slug}`}>
                    <span className="min-w-0 flex-initial truncate font-medium">{b.name}</span>
                    {restrictedIcon(b)}
                    <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
                      /{b.slug}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <StatusBadge tone={STATUS_TONE[b.status]}>
                      {t(`brands.status.${b.status}`)}
                    </StatusBadge>
                  </p>
                </div>
                {/* the same menu as the desktop table — Merge/Delete had no
                 * way to be reached on mobile before this (the 2026-09-18
                 * fix); a single "…" costs no more room than the one direct
                 * button that used to sit here. */}
                <div className="shrink-0">{rowMenu(b)}</div>
              </li>
            ))}
          </ul>

          <ScrollLoadFooter
            hasMore={list.hasMore}
            loadingMore={list.loadingMore}
            loadError={list.loadError}
            sentinelRef={list.sentinelRef}
            onRetry={list.loadMore}
          />
        </>
      )}

      {modal !== null && (
        <BrandFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          brand={modal.mode === 'edit' ? modal.brand : undefined}
          onSaved={onSaved}
          onDelete={(b) => {
            setModal(null);
            void doDelete(b);
          }}
          onAliasesChanged={(b) =>
            list.setItems((prev) => prev.map((x) => (x.id === b.id ? b : x)))
          }
          onConflict={() => {
            setModal(null);
            notify.error(t('brands.editConflict'), 5000);
            resync();
          }}
        />
      )}

      {mergeSource && (
        <BrandMergeDialog
          open
          onOpenChange={(o) => {
            if (!o) setMergeSource(null);
          }}
          source={mergeSource}
          onMerged={(target) => onMerged(mergeSource, target)}
        />
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        tone="primary"
        title={t('brands.restoreTitle')}
        message={t('brands.restoreMessage', { name: labelOf(restoreTarget) })}
        confirmLabel={t('brands.restore')}
        cancelLabel={t('brands.cancel')}
        loading={restoring}
        onConfirm={confirmRestore}
      />

      <ScrollToTopButton label={tCommon('actions.backToTop')} />
    </section>
  );
}
