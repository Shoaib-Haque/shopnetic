'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, Eye, MoreHorizontal } from 'lucide-react';
import type { SellerStatus, SellerWithShop } from '@shopnetic/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  cn,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import {
  ScrollLoadError,
  ScrollLoadFooter,
  ScrollLoadSkeleton,
} from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useHighlightTarget } from '@/hooks/use-highlight-target';
import { useUrlParamsSync } from '@/hooks/use-url-params-sync';
import { getSeller, listSellersPage } from './api';
import { SellerInspectModal, SELLER_STATUS_TONE } from './seller-inspect-modal';

export const ALL_SELLER_TABS = [
  'all',
  'in_review',
  'approved',
  'suspended',
  'offboarding',
  'closed',
  'draft',
] as const;

export type SellerTab = (typeof ALL_SELLER_TABS)[number];

function parseTab(raw: string | null): SellerTab {
  if (raw && (ALL_SELLER_TABS as readonly string[]).includes(raw)) {
    return raw as SellerTab;
  }
  return 'all';
}

export interface SellerListProps {
  locale?: string;
  basePath?: string;
}

export function SellerList({ locale = 'en', basePath = 'x7f2k9t3m1qp' }: SellerListProps) {
  const t = useTranslations('sellers');
  const tCommon = useTranslations('admin');
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<SellerTab>(() =>
    parseTab(searchParams.get('tab') ?? searchParams.get('status')),
  );
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedSearch(q);

  const [inspectingSeller, setInspectingSeller] = useState<SellerWithShop | null>(null);

  const highlightId = searchParams.get('target') ?? searchParams.get('highlight');
  const [highlighted, setHighlighted] = useHighlightTarget<SellerWithShop>({
    targetId: highlightId,
    fetchById: getSeller,
  });

  useUrlParamsSync({
    tab: tab !== 'all' ? tab : undefined,
    q: debouncedQ || undefined,
  });

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listSellersPage({
        status: tab !== 'all' ? (tab as SellerStatus) : undefined,
        q: debouncedQ || undefined,
        cursor,
        limit: 25,
      }).then((page) => ({ items: page.sellers, nextCursor: page.nextCursor })),
    [tab, debouncedQ],
  );

  const list = useScrollLoad<SellerWithShop>(fetchPage, [tab, debouncedQ]);

  const handleTabChange = (newTab: SellerTab) => {
    if (tab !== newTab) {
      setTab(newTab);
    }
  };

  const handleUpdated = (updated: SellerWithShop) => {
    list.setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (highlighted?.id === updated.id) {
      setHighlighted(updated);
    }
  };

  // Pinned deep-link target item if not already in organic items
  const pinnedHighlighted = useMemo(() => {
    if (!highlighted) return [];
    if (tab !== 'all' && highlighted.status !== tab) return [];
    if (list.items.some((item) => item.id === highlighted.id)) return [];
    return [highlighted];
  }, [highlighted, list.items, tab]);

  const items = useMemo(() => {
    return [...pinnedHighlighted, ...list.items];
  }, [pinnedHighlighted, list.items]);

  const searchRef = useRef<HTMLInputElement>(null);

  const rowMenu = (s: SellerWithShop): ReactNode => {
    const auditLogHref = `/${locale}/${basePath}/audit-log?targetId=${encodeURIComponent(s.id)}&targetType=seller`;

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
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setInspectingSeller(s)}>
            <Eye className="mr-2 size-4" aria-hidden />
            {t('actions.inspect')}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={auditLogHref} className="flex items-center">
              <ExternalLink className="mr-2 size-4" aria-hidden />
              {t('actions.viewAuditLog')}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const desktopRow = (s: SellerWithShop): ReactNode => {
    const isSpotlight = highlighted?.id === s.id;
    return (
      <TableRow
        key={s.id}
        data-seller-row={s.id}
        className={cn('scroll-my-24', isSpotlight && 'bg-primary/5')}
      >
        <TableCell className="max-w-[220px]">
          <div className="flex flex-col gap-0.5">
            <span
              className="font-medium text-foreground truncate"
              title={s.shop?.displayName || s.legalName}
            >
              {s.shop?.displayName || s.legalName}
            </span>
            {s.shop?.slug && (
              <span className="text-xs text-muted-foreground truncate" title={`/${s.shop.slug}`}>
                /{s.shop.slug}
              </span>
            )}
          </div>
        </TableCell>

        <TableCell className="max-w-[180px] text-sm text-foreground">
          <span className="block truncate" title={s.legalName}>
            {s.legalName}
          </span>
        </TableCell>

        <TableCell>
          <StatusBadge tone="neutral">{t(`type.${s.type}`)}</StatusBadge>
        </TableCell>

        <TableCell className="font-mono text-sm text-muted-foreground uppercase">
          {s.country}
        </TableCell>

        <TableCell>
          <StatusBadge tone={SELLER_STATUS_TONE[s.status]}>{t(`status.${s.status}`)}</StatusBadge>
        </TableCell>

        <TableCell className="max-w-[200px] text-sm text-muted-foreground">
          <span className="block truncate" title={s.accountEmail ?? '—'}>
            {s.accountEmail ?? '—'}
          </span>
        </TableCell>

        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(s.createdAt).toLocaleDateString()}
        </TableCell>

        <TableCell className="w-12 text-right">{rowMenu(s)}</TableCell>
      </TableRow>
    );
  };

  const mobileCard = (s: SellerWithShop): ReactNode => {
    const isSpotlight = highlighted?.id === s.id;
    return (
      <li
        key={s.id}
        data-seller-row={s.id}
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm',
          isSpotlight && 'border-primary/40 bg-primary/5',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground block truncate">
              {s.shop?.displayName || s.legalName}
            </span>
            {s.shop?.slug && (
              <span className="text-xs text-muted-foreground block truncate">/{s.shop.slug}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge tone={SELLER_STATUS_TONE[s.status]}>{t(`status.${s.status}`)}</StatusBadge>
            {rowMenu(s)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-2 text-muted-foreground">
          <div>
            <span className="block font-medium text-foreground truncate">{s.legalName}</span>
            <span>
              {t(`type.${s.type}`)} • {s.country}
            </span>
          </div>
          <div className="text-right truncate">
            <span className="block truncate">{s.accountEmail ?? '—'}</span>
            <span>{new Date(s.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </li>
    );
  };

  return (
    <section>
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          ref={searchRef}
          value={q}
          onValueChange={setQ}
          onClear={() => setQ('')}
          clearLabel={tCommon('actions.clear')}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:max-w-xs"
        />

        {/* Desktop segmented button tab strip */}
        <div className="hidden sm:inline-flex rounded-md border border-border p-0.5 overflow-x-auto">
          {ALL_SELLER_TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => handleTabChange(tb)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap',
                tab === tb && 'bg-muted font-semibold text-foreground shadow-sm',
              )}
            >
              {t(`filter.${tb}`)}
            </button>
          ))}
        </div>

        {/* Mobile full-width Select dropdown */}
        <div className="sm:hidden w-full">
          <Select value={tab} onValueChange={(val) => handleTabChange(val as SellerTab)}>
            <SelectTrigger aria-label={t('filter.statusLabel')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_SELLER_TABS.map((tb) => (
                <SelectItem key={tb} value={tb}>
                  {t(`filter.${tb}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content Area */}
      {list.loading ? (
        <ScrollLoadSkeleton />
      ) : list.loadError ? (
        <ScrollLoadError onRetry={list.retry} />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {debouncedQ || tab !== 'all' ? t('emptyFilter') : t('empty')}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cols.shop')}</TableHead>
                  <TableHead>{t('cols.legalName')}</TableHead>
                  <TableHead>{t('cols.type')}</TableHead>
                  <TableHead>{t('cols.country')}</TableHead>
                  <TableHead>{t('cols.status')}</TableHead>
                  <TableHead>{t('cols.accountEmail')}</TableHead>
                  <TableHead>{t('cols.createdAt')}</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">{t('cols.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{items.map((s) => desktopRow(s))}</TableBody>
            </Table>
          </div>

          {/* Mobile Card View (< lg) */}
          <ul className="lg:hidden flex flex-col gap-3">{items.map((s) => mobileCard(s))}</ul>

          <ScrollLoadFooter
            hasMore={list.hasMore}
            loadingMore={list.loadingMore}
            loadError={list.loadError}
            sentinelRef={list.sentinelRef}
            onRetry={list.loadMore}
          />
        </>
      )}

      {/* Inspection Modal */}
      <SellerInspectModal
        open={Boolean(inspectingSeller)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setInspectingSeller(null);
        }}
        seller={inspectingSeller}
        onUpdated={handleUpdated}
        locale={locale}
        basePath={basePath}
      />
    </section>
  );
}
