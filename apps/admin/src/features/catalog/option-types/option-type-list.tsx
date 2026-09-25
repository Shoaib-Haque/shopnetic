'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionStatus, OptionType } from '@shopnetic/contracts';
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
import { OptionTypeFormModal } from './option-type-form-modal';
import { deleteOptionType, listOptionTypesPage, restoreOptionType } from './api';

type Tab = 'live' | 'archived';
const TABS: Tab[] = ['live', 'archived'];
const STATUS_FILTERS: Array<OptionStatus | 'all'> = ['all', 'active', 'deprecated'];

const STATUS_TONE: Record<OptionStatus, StatusTone> = {
  active: 'success',
  deprecated: 'neutral',
};

function parseTab(v: string | null): Tab {
  return v === 'archived' ? 'archived' : 'live';
}
function parseStatusFilter(v: string | null): OptionStatus | 'all' {
  return v === 'active' || v === 'deprecated' ? v : 'all';
}

type ModalState = { mode: 'create' } | { mode: 'edit'; optionType: OptionType } | null;

export function OptionTypeList() {
  const t = useTranslations('catalog');
  const tCommon = useTranslations('admin');
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')));
  const [statusFilter, setStatusFilter] = useState<OptionStatus | 'all'>(() =>
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

  // still mounted? an undo toast outlives this page (same reasoning as
  // Brand List's own guard).
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
      listOptionTypesPage({
        archived: tab === 'archived',
        // the status dropdown only renders on the Live tab (below), but its
        // last-picked value stayed in state — gated here too so a filter
        // chosen before switching to Archived doesn't silently keep
        // applying to a query the UI no longer shows it for (mirrors
        // Brand List's own guard, the 2026-09-17 fix).
        ...(tab === 'live' && statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.optionTypes, nextCursor: p.nextCursor })),
    [tab, statusFilter, debouncedQ],
  );
  const list = useScrollLoad<OptionType>(fetchPage, [tab, statusFilter, debouncedQ]);

  // deep link from Audit Log's Target column — keeps loading pages until
  // the row turns up (only ever finds it on the live tab), then flashes it
  // in place (same pattern Brand/Category use).
  const highlighted = useFindById(
    highlightId,
    list.items,
    list.hasMore,
    list.loading || list.loadingMore,
    list.loadMore,
  );
  const { flashId, flash } = useRowFlash('data-option-type-row');
  useEffect(() => {
    if (highlighted) flash(highlighted.id);
  }, [highlighted, flash]);

  // `refresh`, not `retry` — a post-mutation resync must not blank/skeleton
  // the whole list before showing it again (mirrors Brand List's own
  // `resync`).
  const listRefresh = list.refresh;
  const resync = useCallback(() => {
    if (!mounted.current) return;
    listRefresh();
  }, [listRefresh]);

  const labelOf = (ot: OptionType | null | undefined): string =>
    ot ? capForMessage(ot.name['en'] ?? ot.code) : '';

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  const { doDelete, restoreTarget, setRestoreTarget, restoring, confirmRestore } =
    useSoftDeleteWithUndo<OptionType>({
      deleteItem: deleteOptionType,
      restoreItem: restoreOptionType,
      resync,
      labelOf,
      onError: err,
      messages: {
        deleted: (name) => t('optionTypes.toast.deleted', { name }),
        restored: (name) => t('optionTypes.toast.restored', { name }),
        alreadyDeleted: (name) => t('optionTypes.alreadyDeleted', { name }),
        alreadyRestored: (name) => t('optionTypes.alreadyRestored', { name }),
        undoLabel: t('optionTypes.undo'),
      },
    });

  function onSaved(action: 'created' | 'updated', ot: OptionType): void {
    notify.saved(t(`optionTypes.toast.${action}`, { name: labelOf(ot) }));
    resync();
  }

  const emptyMsg =
    !list.loading && !list.loadError && list.items.length === 0
      ? debouncedQ
        ? t('optionTypes.noMatch')
        : t('optionTypes.empty')
      : null;

  const rowMenu = (ot: OptionType): ReactNode => (
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
          <DropdownMenuItem onSelect={() => setRestoreTarget(ot)}>
            {t('optionTypes.restore')}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', optionType: ot })}>
              {t('optionTypes.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void doDelete(ot)}
              className="text-destructive focus:text-destructive"
            >
              {t('optionTypes.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section>
      <PageHeader
        title={t('optionTypes.title')}
        description={t('optionTypes.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('optionTypes.new')}
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
          placeholder={t('optionTypes.searchPlaceholder')}
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
              {t(`optionTypes.filter.${tb}`)}
            </button>
          ))}
        </div>
        {tab === 'live' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OptionStatus | 'all')}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`optionTypes.statusFilter.${s}`)}
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
                  <TableHead className="pl-2">{t('optionTypes.cols.code')}</TableHead>
                  <TableHead>{t('optionTypes.cols.name')}</TableHead>
                  <TableHead className="w-28">{t('optionTypes.cols.dataType')}</TableHead>
                  <TableHead className="hidden w-16 text-center lg:table-cell">
                    {t('optionTypes.cols.swatch')}
                  </TableHead>
                  <TableHead className="hidden w-20 text-right lg:table-cell">
                    {t('optionTypes.cols.values')}
                  </TableHead>
                  <TableHead className="w-28">{t('optionTypes.cols.status')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((ot) => (
                  <TableRow
                    key={ot.id}
                    data-option-type-row={ot.id}
                    className={cn('scroll-my-24', ot.id === flashId && 'sn-row-flash')}
                  >
                    <TableCell className="pl-2 text-sm text-muted-foreground">{ot.code}</TableCell>
                    <TableCell className="truncate font-medium">
                      {ot.name['en'] ?? ot.code}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t(`optionTypes.dataType.${ot.dataType}`)}
                    </TableCell>
                    <TableCell className="hidden text-center lg:table-cell">
                      {ot.hasSwatch ? t('optionTypes.yes') : t('optionTypes.no')}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                      {ot.values.length}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_TONE[ot.status]}>
                        {t(`optionTypes.status.${ot.status}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{rowMenu(ot)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {list.items.map((ot) => (
              <li
                key={ot.id}
                data-option-type-row={ot.id}
                className={cn(
                  'flex items-start gap-3 px-3 py-3',
                  ot.id === flashId && 'sn-row-flash',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 flex-initial truncate font-medium">
                      {ot.name['en'] ?? ot.code}
                    </span>
                    <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
                      {ot.code}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <StatusBadge tone={STATUS_TONE[ot.status]}>
                      {t(`optionTypes.status.${ot.status}`)}
                    </StatusBadge>
                    <span>{t(`optionTypes.dataType.${ot.dataType}`)}</span>
                    <span>·</span>
                    <span>{ot.values.length}</span>
                  </p>
                </div>
                <div className="shrink-0">{rowMenu(ot)}</div>
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
        <OptionTypeFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          optionType={modal.mode === 'edit' ? modal.optionType : undefined}
          onSaved={onSaved}
          onDelete={(ot) => {
            setModal(null);
            void doDelete(ot);
          }}
          onValuesChanged={(ot) =>
            list.setItems((prev) => prev.map((x) => (x.id === ot.id ? ot : x)))
          }
          onConflict={() => {
            setModal(null);
            notify.error(t('optionTypes.editConflict'), 5000);
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
        title={t('optionTypes.restoreTitle')}
        message={t('optionTypes.restoreMessage', { name: labelOf(restoreTarget) })}
        confirmLabel={t('optionTypes.restore')}
        cancelLabel={t('optionTypes.cancel')}
        loading={restoring}
        onConfirm={confirmRestore}
      />

      <ScrollToTopButton label={tCommon('actions.backToTop')} />
    </section>
  );
}
