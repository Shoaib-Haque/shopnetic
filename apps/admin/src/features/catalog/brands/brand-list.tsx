'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArchiveRestore, Merge as MergeIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Brand, BrandStatus } from '@shopnetic/contracts';
import {
  cn,
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
  type StatusTone,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { ScrollLoadFooter, ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
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
  const [restoreTarget, setRestoreTarget] = useState<Brand | null>(null);
  const [restoring, setRestoring] = useState(false);

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
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
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

  const resync = useCallback(() => {
    if (!mounted.current) return;
    list.retry();
  }, [list]);

  const labelOf = (b: Brand | null | undefined): string => (b ? capForMessage(b.name) : '');

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  // ── delete: soft (archive) + a one-click undo, no confirm dialog — same
  // idiom Category List uses for its own soft-delete. ─────────────────────
  async function doDelete(b: Brand): Promise<void> {
    try {
      await deleteBrand(b.id);
      notify.undo(t('brands.toast.deleted', { name: labelOf(b) }), {
        undoLabel: t('brands.undo'),
        undoneMessage: t('brands.toast.restored', { name: labelOf(b) }),
        onUndo: async () => {
          try {
            await restoreBrand(b.id);
            resync();
          } catch (e) {
            err(e);
            throw e;
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
      await restoreBrand(restoreTarget.id);
      notify.saved(t('brands.toast.restored', { name: labelOf(restoreTarget) }));
      setRestoreTarget(null);
      resync();
    } catch (e) {
      err(e);
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }

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

  const rowActions = (b: Brand) => {
    if (tab === 'archived') {
      return (
        <ActionButton
          icon={ArchiveRestore}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          onClick={() => setRestoreTarget(b)}
        >
          {t('brands.restore')}
        </ActionButton>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <ActionButton
          icon={Pencil}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          onClick={() => setModal({ mode: 'edit', brand: b })}
        >
          {t('brands.edit')}
        </ActionButton>
        <ActionButton
          icon={MergeIcon}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          onClick={() => setMergeSource(b)}
        >
          {t('brands.merge')}
        </ActionButton>
        <ActionButton
          icon={Trash2}
          variant="ghost"
          size="sm"
          collapseLabel="lg"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void doDelete(b)}
        >
          {t('brands.delete')}
        </ActionButton>
      </span>
    );
  };

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
                  <TableHead className="w-28 lg:w-64" />
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
                      <p className="truncate font-medium" title={`${b.name} /${b.slug}`}>
                        {b.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          /{b.slug}
                        </span>
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <StatusBadge tone={STATUS_TONE[b.status]}>
                          {t(`brands.status.${b.status}`)}
                        </StatusBadge>
                        {b.isRestricted && (
                          <span title={t('brands.restrictedHint')}>
                            <StatusBadge tone="warning">{t('brands.restricted')}</StatusBadge>
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {b.aliases.length}
                    </TableCell>
                    <TableCell className="text-right">{rowActions(b)}</TableCell>
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
                  <p className="truncate font-medium" title={`${b.name} /${b.slug}`}>
                    {b.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      /{b.slug}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <StatusBadge tone={STATUS_TONE[b.status]}>
                      {t(`brands.status.${b.status}`)}
                    </StatusBadge>
                    {b.isRestricted && (
                      <StatusBadge tone="warning">{t('brands.restricted')}</StatusBadge>
                    )}
                  </p>
                </div>
                <div className="shrink-0">
                  {tab === 'archived' ? (
                    <ActionButton
                      icon={ArchiveRestore}
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreTarget(b)}
                    >
                      {t('brands.restore')}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      icon={Pencil}
                      variant="outline"
                      size="sm"
                      onClick={() => setModal({ mode: 'edit', brand: b })}
                    >
                      {t('brands.edit')}
                    </ActionButton>
                  )}
                </div>
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
