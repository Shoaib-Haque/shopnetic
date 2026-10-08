'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionType, ValueSet, ValueSetListStatus } from '@shopnetic/contracts';
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
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useSoftDeleteWithUndo } from '@/components/crud/use-soft-delete-with-undo';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useHighlightTarget } from '@/hooks/use-highlight-target';
import { useUrlParamsSync } from '@/hooks/use-url-params-sync';
import { capForMessage } from '@/lib/format';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { ValueSetFormModal } from './value-set-form-modal';
import { deleteValueSet, getValueSet, listValueSets, restoreValueSet } from './api';

type Tab = ValueSetListStatus;
const TABS: Tab[] = ['active', 'archived', 'all'];

function parseTab(v: string | null): Tab {
  return v === 'archived' || v === 'all' ? v : 'active';
}

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; valueSet: ValueSet }
  | { mode: 'view'; valueSet: ValueSet }
  | null;

export function ValueSetList() {
  const t = useTranslations('catalog');
  const tCommon = useTranslations('admin');
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() =>
    parseTab(searchParams.get('tab') ?? searchParams.get('status')),
  );
  const [optionTypeFilter, setOptionTypeFilter] = useState(
    () => searchParams.get('optionType') ?? '',
  );
  const [highlightId] = useState(() => searchParams.get('highlight') ?? searchParams.get('target'));
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedSearch(q);

  useUrlParamsSync({
    tab: tab !== 'active' ? tab : undefined,
    optionType: optionTypeFilter || undefined,
    q: debouncedQ,
  });

  const [modal, setModal] = useState<ModalState>(null);
  const [items, setItems] = useState<ValueSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Clear items when switching tabs so skeleton displays immediately
  useEffect(() => {
    setItems([]);
  }, [tab]);

  // Available option types for badges and filtering (both live and archived so archived ones show their names).
  // Deliberately sequential, not `Promise.all` — firing both at mount alongside the
  // main list fetch and the deep-link highlight fetch put this page at 4 concurrent
  // requests, doubled to 8 by React StrictMode in dev, over Chrome's 6-per-origin
  // connection cap. The overflow queues for a free connection regardless of fetch
  // priority (priority only reorders an already-queued overflow, it can't get a
  // request into the initial 6 — the same root cause diagnosed for Category's own
  // deep-link delay), so the highlight fetch could lose that race and visibly land
  // ~800ms after the rest of the list (found live 2026-10-08). Deferring the lower-
  // priority archived-types fetch until the live one resolves keeps the initial
  // burst at 3 distinct fetches (6 doubled), right at the cap instead of over it —
  // archived option-type labels (only needed for a value set whose own type was
  // since archived) arrive a beat later, which is far less noticeable than the
  // pinned row itself being late.
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);
  useEffect(() => {
    let cancelled = false;
    listOptionTypesPage({ limit: 100 })
      .then((liveRes) => {
        if (cancelled) return;
        setOptionTypes(liveRes.optionTypes);
        return listOptionTypesPage({ archived: true, limit: 100 });
      })
      .then((archivedRes) => {
        if (cancelled || !archivedRes) return;
        setOptionTypes((prev) => {
          const byId = new Map(prev.map((ot) => [ot.id, ot]));
          for (const ot of archivedRes.optionTypes) byId.set(ot.id, ot);
          return Array.from(byId.values());
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const liveOptionTypes = useMemo(() => optionTypes.filter((ot) => !ot.archived), [optionTypes]);
  const optionTypeMap = useMemo(() => new Map(optionTypes.map((ot) => [ot.id, ot])), [optionTypes]);

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

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listValueSets({
        status: tab,
        ...(optionTypeFilter ? { optionTypeId: optionTypeFilter } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
      });
      if (mounted.current) {
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (mounted.current) {
        const msg = t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined));
        setLoadError(msg);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [tab, optionTypeFilter, debouncedQ, t]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const resync = useCallback(() => {
    if (!mounted.current) return;
    void fetchItems();
  }, [fetchItems]);

  // Deep link highlighting target (?target=<id> or ?highlight=<id>)
  const [highlighted, setHighlighted] = useHighlightTarget<ValueSet>({
    targetId: highlightId,
    fetchById: getValueSet,
    ...(tab !== 'all'
      ? {
          tab: tab === 'archived' ? ('archived' as const) : ('live' as const),
          setTab: (targetTab: 'live' | 'archived') =>
            setTab(targetTab === 'archived' ? 'archived' : 'active'),
          isArchived: (vs: ValueSet) => !!vs.deletedAt,
        }
      : {}),
  });

  // Immediate deep-link target: either hook-fetched record, or if the main
  // list query already loaded the targeted record, promote it immediately
  // on first paint so there is zero pop-in delay or visual jump.
  const effectiveHighlighted = useMemo(
    () => highlighted ?? (highlightId ? (items.find((x) => x.id === highlightId) ?? null) : null),
    [highlighted, highlightId, items],
  );

  const labelOf = (vs: ValueSet | null | undefined): string => (vs ? capForMessage(vs.name) : '');

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  const { doDelete, restoreTarget, setRestoreTarget, restoring, confirmRestore } =
    useSoftDeleteWithUndo<ValueSet>({
      deleteItem: deleteValueSet,
      restoreItem: restoreValueSet,
      resync,
      labelOf,
      onError: err,
      messages: {
        deleted: (name) => t('valueSets.toast.deleted', { name }),
        restored: (name) => t('valueSets.toast.restored', { name }),
        alreadyDeleted: (name) => t('valueSets.alreadyDeleted', { name }),
        alreadyRestored: (name) => t('valueSets.alreadyRestored', { name }),
        undoLabel: t('valueSets.undo'),
      },
    });

  function onSaved(action: 'created' | 'updated', vs: ValueSet): void {
    notify.saved(t(`valueSets.toast.${action}`, { name: labelOf(vs) }));
    if (action === 'updated') {
      setItems((prev) =>
        prev.map((x) => (x.id === vs.id ? vs : x)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (effectiveHighlighted?.id === vs.id) setHighlighted(vs);
    } else {
      resync();
    }
  }

  const showSpotlight = effectiveHighlighted !== null;
  const emptyMsg =
    !loading && !loadError && items.length === 0 && !showSpotlight
      ? debouncedQ
        ? t('valueSets.noMatch')
        : tab === 'archived'
          ? t('valueSets.emptyArchived')
          : t('valueSets.empty')
      : null;

  const rowMenu = (vs: ValueSet): ReactNode => {
    const isArchived = Boolean(vs.deletedAt);
    return (
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
          {isArchived ? (
            <>
              <DropdownMenuItem onSelect={() => setRestoreTarget(vs)}>
                {t('valueSets.restore')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setModal({ mode: 'view', valueSet: vs })}>
                {t('valueSets.view')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', valueSet: vs })}>
                {t('valueSets.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void doDelete(vs)}
                className="text-destructive focus:text-destructive"
              >
                {t('valueSets.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const desktopRow = (vs: ValueSet, opts?: { spotlight?: boolean }): ReactNode => {
    const ot = optionTypeMap.get(vs.optionTypeId);
    const otName = ot ? (ot.name['en'] ?? ot.code) : vs.optionTypeId;
    const isArchived = Boolean(vs.deletedAt);

    return (
      <TableRow
        key={vs.id}
        data-value-set-row={vs.id}
        className={cn('scroll-my-24', opts?.spotlight && 'bg-primary/5')}
      >
        <TableCell className="truncate pl-2 font-medium" title={vs.name}>
          {vs.name}
        </TableCell>
        <TableCell>
          <span
            className="block truncate text-sm"
            title={`${otName}${ot ? ` (${ot.code})` : ''}${ot?.archived ? ` [${t('valueSets.status.archived')}]` : ''}`}
          >
            <span className="font-medium text-foreground">{otName}</span>
            {ot && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">({ot.code})</span>
            )}
            {ot?.archived && (
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                {t('valueSets.status.archived')}
              </span>
            )}
          </span>
        </TableCell>
        <TableCell className="text-center text-sm text-muted-foreground">
          {vs.items.length}
        </TableCell>
        <TableCell>
          <StatusBadge tone={isArchived ? 'neutral' : 'success'}>
            {t(isArchived ? 'valueSets.status.archived' : 'valueSets.status.active')}
          </StatusBadge>
        </TableCell>
        <TableCell className="w-10 text-right">{rowMenu(vs)}</TableCell>
      </TableRow>
    );
  };

  const mobileCard = (vs: ValueSet, opts?: { spotlight?: boolean }): ReactNode => {
    const ot = optionTypeMap.get(vs.optionTypeId);
    const otName = ot ? (ot.name['en'] ?? ot.code) : vs.optionTypeId;
    const isArchived = Boolean(vs.deletedAt);

    return (
      <li
        key={vs.id}
        data-value-set-row={vs.id}
        className={cn('flex items-start gap-3 px-3 py-3', opts?.spotlight && 'bg-primary/5')}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground" title={vs.name}>
            {vs.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge tone={isArchived ? 'neutral' : 'success'}>
              {t(isArchived ? 'valueSets.status.archived' : 'valueSets.status.active')}
            </StatusBadge>
            <span
              className="max-w-[160px] truncate"
              title={`${otName}${ot ? ` (${ot.code})` : ''}${ot?.archived ? ` [${t('valueSets.status.archived')}]` : ''}`}
            >
              {otName}
              {ot && ` (${ot.code})`}
              {ot?.archived && ` [${t('valueSets.status.archived')}]`}
            </span>
            <span>·</span>
            <span>
              {vs.items.length} {t('valueSets.cols.items').toLowerCase()}
            </span>
          </p>
        </div>
        <div className="shrink-0">{rowMenu(vs)}</div>
      </li>
    );
  };

  // Deduped items (excluding highlighted row if already present in real items)
  const renderedItems = useMemo(
    () => (effectiveHighlighted ? items.filter((x) => x.id !== effectiveHighlighted.id) : items),
    [items, effectiveHighlighted],
  );

  return (
    <section>
      <PageHeader
        title={t('valueSets.title')}
        description={t('valueSets.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('valueSets.new')}
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
          placeholder={t('valueSets.searchPlaceholder')}
          className="w-full max-w-xs"
        />

        <div className="inline-flex rounded-md border border-border p-0.5">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={cn(
                'rounded px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground',
                tab === tb && 'bg-muted font-medium text-foreground',
              )}
            >
              {t(`valueSets.filter.${tb}`)}
            </button>
          ))}
        </div>

        {liveOptionTypes.length > 0 && (
          <select
            value={optionTypeFilter}
            onChange={(e) => setOptionTypeFilter(e.target.value)}
            className="h-9 w-44 sm:w-56 truncate rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]"
          >
            <option value="">{t('optionTypes.title')}: All</option>
            {liveOptionTypes.map((ot) => {
              const label = `${ot.name['en'] ?? ot.code} (${ot.code})`;
              return (
                <option key={ot.id} value={ot.id} title={label}>
                  {capForMessage(label, 48)}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {loading && items.length === 0 && !effectiveHighlighted ? (
        <ScrollLoadSkeleton />
      ) : loadError ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {loadError}
        </div>
      ) : emptyMsg ? (
        <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden rounded-md border border-border md:block">
            <Table className="table-fixed" scrollX={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-2">{t('valueSets.cols.name')}</TableHead>
                  <TableHead className="w-56 sm:w-64">{t('valueSets.cols.optionType')}</TableHead>
                  <TableHead className="w-20 text-center">{t('valueSets.cols.items')}</TableHead>
                  <TableHead className="w-28">{t('valueSets.cols.status')}</TableHead>
                  <TableHead className="w-10 text-right">{t('valueSets.cols.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effectiveHighlighted && desktopRow(effectiveHighlighted, { spotlight: true })}
                {renderedItems.map((vs) => desktopRow(vs))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {effectiveHighlighted && mobileCard(effectiveHighlighted, { spotlight: true })}
            {renderedItems.map((vs) => mobileCard(vs))}
          </ul>
        </>
      )}

      {/* Form Modal */}
      {modal !== null && (
        <ValueSetFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          valueSet={modal.mode !== 'create' ? modal.valueSet : undefined}
          optionTypes={optionTypes}
          onSaved={onSaved}
          onDelete={(vs) => {
            setModal(null);
            void doDelete(vs);
          }}
          onValuesChanged={(vs) => {
            setItems((prev) => prev.map((x) => (x.id === vs.id ? vs : x)));
            if (effectiveHighlighted?.id === vs.id) setHighlighted(vs);
          }}
          onConflict={() => {
            setModal(null);
            notify.error(t('valueSets.editConflict'), 5000);
            resync();
          }}
        />
      )}

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        tone="primary"
        title={t('valueSets.restoreTitle')}
        message={t('valueSets.restoreMessage', { name: labelOf(restoreTarget) })}
        confirmLabel={t('valueSets.restore')}
        cancelLabel={t('valueSets.cancel')}
        loading={restoring}
        onConfirm={confirmRestore}
      />

      <ScrollToTopButton label={tCommon('actions.backToTop')} />
    </section>
  );
}
