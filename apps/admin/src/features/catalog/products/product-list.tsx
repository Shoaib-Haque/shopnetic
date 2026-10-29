'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type Brand,
  type Category,
  type Product,
  type ProductListStatus,
  type ProductOrigin,
  formatMoney,
} from '@shopnetic/contracts';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  notify,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollToTopButton,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useSoftDeleteWithUndo } from '@/components/crud/use-soft-delete-with-undo';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useHighlightTarget } from '@/hooks/use-highlight-target';
import { useUrlParamsSync } from '@/hooks/use-url-params-sync';
import { capForMessage } from '@/lib/format';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { listCategories } from '@/features/catalog/categories/api';
import { listBrandsPage } from '@/features/catalog/brands/api';
import { ProductFormModal } from './product-form-modal';
import { ProductOptionsDialog } from './product-options-dialog';
import { ProductVariantsDialog } from './product-variants-dialog';
import { ProductMediaDialog } from './product-media-dialog';
import { ProductOffersDialog } from './product-offers-dialog';
import { deleteProduct, getProduct, listProductsPage, restoreProduct } from './api';

type Tab = ProductListStatus;
const TABS: Tab[] = ['active', 'pending', 'draft', 'archived', 'all'];

function parseTab(v: string | null): Tab {
  if (v === 'pending' || v === 'draft' || v === 'archived' || v === 'active' || v === 'all')
    return v;
  return 'all';
}

type OriginFilter = ProductOrigin;
const ORIGIN_FILTERS: OriginFilter[] = ['all', '1p', '3p'];

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; product: Product }
  | { mode: 'review'; product: Product }
  | { mode: 'view'; product: Product }
  | null;

const STATUS_TONE: Record<Product['status'], StatusTone> = {
  active: 'success',
  pending: 'warning',
  draft: 'neutral',
  archived: 'neutral',
};

function formatPrice(basePriceMinor: string | null, currency: string | null): string {
  if (!basePriceMinor) return '—';
  return formatMoney(basePriceMinor, currency ?? 'USD');
}

export function ProductList() {
  const t = useTranslations('catalog');
  const tCommon = useTranslations('admin');
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() =>
    parseTab(searchParams.get('tab') ?? searchParams.get('status')),
  );
  const [originFilter, setOriginFilter] = useState<OriginFilter>(
    () => (searchParams.get('origin') as OriginFilter) || 'all',
  );
  const [categoryFilter, setCategoryFilter] = useState(
    () => searchParams.get('category') ?? searchParams.get('categoryId') ?? '',
  );
  const [brandFilter, setBrandFilter] = useState(
    () => searchParams.get('brand') ?? searchParams.get('brandId') ?? '',
  );
  const [highlightId] = useState(() => searchParams.get('highlight') ?? searchParams.get('target'));
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedSearch(q);

  useUrlParamsSync({
    tab: tab !== 'all' ? tab : undefined,
    origin: originFilter !== 'all' ? originFilter : undefined,
    category: categoryFilter || undefined,
    brand: brandFilter || undefined,
    q: debouncedQ,
  });

  const [modal, setModal] = useState<ModalState>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);
  const [mediaProduct, setMediaProduct] = useState<Product | null>(null);
  const [offersProduct, setOffersProduct] = useState<Product | null>(null);
  const [offersVariantId, setOffersVariantId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCategories({ status: 'all' })
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {});
    Promise.all([listBrandsPage({ limit: 100 }), listBrandsPage({ archived: true, limit: 100 })])
      .then(([liveRes, archRes]) => {
        if (!cancelled) {
          const map = new Map<string, Brand>();
          for (const b of [...liveRes.brands, ...archRes.brands]) {
            map.set(b.id, b);
          }
          setBrands(Array.from(map.values()));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

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
      listProductsPage({
        status: tab,
        origin: originFilter,
        ...(categoryFilter ? { categoryId: categoryFilter } : {}),
        ...(brandFilter ? { brandId: brandFilter } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.products, nextCursor: p.nextCursor })),
    [tab, originFilter, categoryFilter, brandFilter, debouncedQ],
  );

  const list = useScrollLoad<Product>(fetchPage, [
    tab,
    originFilter,
    categoryFilter,
    brandFilter,
    debouncedQ,
  ]);

  const [highlighted, setHighlighted] = useHighlightTarget<Product>({
    targetId: highlightId,
    fetchById: getProduct,
    ...(tab !== 'all'
      ? {
          tab: tab === 'archived' ? ('archived' as const) : ('live' as const),
          setTab: (targetTab: 'live' | 'archived') =>
            setTab(targetTab === 'archived' ? 'archived' : 'active'),
          isArchived: (p: Product) => p.status === 'archived' || !!p.archivedAt,
        }
      : {}),
  });

  const effectiveHighlighted = useMemo(
    () =>
      highlighted ?? (highlightId ? (list.items.find((x) => x.id === highlightId) ?? null) : null),
    [highlighted, highlightId, list.items],
  );

  useEffect(() => {
    if (!effectiveHighlighted) return;
    const action = searchParams.get('action');
    if (action === 'options') {
      setOptionsProduct(effectiveHighlighted);
    } else if (action === 'variants') {
      setVariantsProduct(effectiveHighlighted);
    } else if (action === 'media') {
      setMediaProduct(effectiveHighlighted);
    } else if (action === 'offers') {
      setOffersProduct(effectiveHighlighted);
    }
  }, [effectiveHighlighted, searchParams]);

  const listRefresh = list.refresh;
  const resync = useCallback(() => {
    if (!mounted.current) return;
    listRefresh();
  }, [listRefresh]);

  const labelOf = (p: Product | null | undefined): string =>
    p?.title?.en ? capForMessage(p.title.en) : (p?.slug ?? '');

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  const { doDelete, restoreTarget, setRestoreTarget, restoring, confirmRestore } =
    useSoftDeleteWithUndo<Product>({
      deleteItem: deleteProduct,
      restoreItem: restoreProduct,
      resync,
      onOptimisticRemove: (p) => list.setItems((prev) => prev.filter((x) => x.id !== p.id)),
      onOptimisticRestore: (p) =>
        list.setItems((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev])),
      labelOf,
      onError: err,
      messages: {
        deleted: (title) => t('products.toast.deleted', { title }),
        restored: (title) => t('products.toast.restored', { title }),
        alreadyDeleted: (title) => t('products.alreadyDeleted', { title }),
        alreadyRestored: (title) => t('products.alreadyRestored', { title }),
        undoLabel: t('products.undo'),
      },
    });

  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (tab !== 'all') count++;
    if (originFilter !== 'all') count++;
    if (categoryFilter) count++;
    if (brandFilter) count++;
    return count;
  }, [tab, originFilter, categoryFilter, brandFilter]);
  const filtersActive = activeFiltersCount > 0;

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      if (tab !== newTab) {
        setTab(newTab);
        setOriginFilter('all');
        setCategoryFilter('');
        setBrandFilter('');
        setQ('');
      }
    },
    [tab],
  );

  const clearFilters = useCallback(() => {
    setTab('all');
    setOriginFilter('all');
    setCategoryFilter('');
    setBrandFilter('');
    setQ('');
  }, []);

  function onSaved(action: 'created' | 'updated', p: Product): void {
    notify.saved(t(`products.toast.${action}`, { title: labelOf(p) }));
    if (action === 'updated') {
      const matchesStatus = tab === 'all' || p.status === tab;
      if (!matchesStatus) {
        list.setItems((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        list.setItems((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        if (effectiveHighlighted?.id === p.id) {
          setHighlighted(p);
        }
      }
    } else {
      if (tab !== 'all' && tab !== p.status) {
        handleTabChange(p.status);
      }
      setHighlighted(p);
      resync();
    }
  }

  const showSpotlight = effectiveHighlighted !== null;
  const emptyMsg =
    !list.loading && !list.loadError && list.items.length === 0 && !showSpotlight
      ? debouncedQ || categoryFilter || brandFilter || originFilter !== 'all'
        ? t('products.noMatch')
        : t('products.empty')
      : null;

  const rowMenu = (p: Product): ReactNode => (
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
        {p.status === 'archived' ? (
          <>
            <DropdownMenuItem onSelect={() => setModal({ mode: 'view', product: p })}>
              {t('products.view')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOptionsProduct(p)}>
              {t('products.optionsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setVariantsProduct(p)}>
              {t('products.variantsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMediaProduct(p)}>
              {t('products.mediaAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOffersProduct(p)}>
              {t('products.offersAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRestoreTarget(p)}>
              {t('products.restore')}
            </DropdownMenuItem>
          </>
        ) : p.status === 'pending' ? (
          <>
            <DropdownMenuItem onSelect={() => setModal({ mode: 'review', product: p })}>
              {t('products.review')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOptionsProduct(p)}>
              {t('products.optionsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setVariantsProduct(p)}>
              {t('products.variantsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMediaProduct(p)}>
              {t('products.mediaAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOffersProduct(p)}>
              {t('products.offersAction')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', product: p })}>
              {t('products.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOptionsProduct(p)}>
              {t('products.optionsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setVariantsProduct(p)}>
              {t('products.variantsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMediaProduct(p)}>
              {t('products.mediaAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOffersProduct(p)}>
              {t('products.offersAction')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void doDelete(p)}
              className="text-destructive focus:text-destructive"
            >
              {t('products.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const desktopRow = (p: Product, opts?: { spotlight?: boolean }): ReactNode => {
    const cat = categoryMap.get(p.categoryId);
    const catName = cat ? cat.name.en || cat.slug : t('products.archivedCategory');
    const brand = p.brandId ? brandMap.get(p.brandId) : null;
    const brandName = p.brandId ? (brand ? brand.name : t('products.archivedBrand')) : '—';
    const title = p.title?.en ?? p.slug;

    return (
      <TableRow
        key={p.id}
        data-product-row={p.id}
        className={cn('scroll-my-24', opts?.spotlight && 'bg-primary/5')}
      >
        <TableCell className="pl-3 max-w-[280px]">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <span
                className="font-medium text-foreground line-clamp-2 leading-snug break-words flex-1 min-w-0"
                title={title}
              >
                {title}
              </span>
              {p.proposedBySellerId ? (
                <StatusBadge tone="warning" className="shrink-0 mt-0.5">
                  {t('products.originBadges.threeP')}
                </StatusBadge>
              ) : (
                <StatusBadge tone="neutral" className="shrink-0 mt-0.5">
                  {t('products.originBadges.oneP')}
                </StatusBadge>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate block" title={`/${p.slug}`}>
              /{p.slug}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-sm text-foreground max-w-[160px]">
          <span className="block truncate" title={catName}>
            {catName}
          </span>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground max-w-[140px]">
          <span className="block truncate" title={brandName}>
            {brandName}
          </span>
        </TableCell>
        <TableCell className="text-sm font-mono text-muted-foreground whitespace-nowrap tabular-nums min-w-[100px]">
          {formatPrice(p.basePriceMinor, p.currency)}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <StatusBadge tone={STATUS_TONE[p.status]}>{t(`products.status.${p.status}`)}</StatusBadge>
        </TableCell>
        <TableCell className="w-12 text-right">{rowMenu(p)}</TableCell>
      </TableRow>
    );
  };

  const mobileCard = (p: Product, opts?: { spotlight?: boolean }): ReactNode => {
    const cat = categoryMap.get(p.categoryId);
    const catName = cat ? cat.name.en || cat.slug : t('products.archivedCategory');
    const brand = p.brandId ? brandMap.get(p.brandId) : null;
    const brandName = p.brandId ? (brand ? brand.name : t('products.archivedBrand')) : '—';
    const title = p.title?.en ?? p.slug;

    return (
      <li
        key={p.id}
        data-product-row={p.id}
        className={cn('flex items-start gap-3 px-3 py-3', opts?.spotlight && 'bg-primary/5')}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-start justify-between gap-1.5 min-w-0">
            <span
              className="font-medium text-foreground line-clamp-2 leading-snug break-words flex-1 min-w-0"
              title={title}
            >
              {title}
            </span>
            <StatusBadge
              tone={p.proposedBySellerId ? 'warning' : 'neutral'}
              className="shrink-0 mt-0.5 text-[11px]"
            >
              {p.proposedBySellerId
                ? t('products.originBadges.threeP')
                : t('products.originBadges.oneP')}
            </StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground truncate" title={`/${p.slug}`}>
            /{p.slug}
          </p>
          <p className="text-xs text-muted-foreground truncate" title={catName}>
            {catName}
          </p>
          <p className="text-xs text-muted-foreground truncate" title={brandName}>
            Brand: {brandName}
          </p>
          <p className="text-xs font-mono text-muted-foreground whitespace-nowrap tabular-nums">
            Base Price: {formatPrice(p.basePriceMinor, p.currency)}
          </p>
          <div className="pt-1">
            <StatusBadge tone={STATUS_TONE[p.status]}>
              {t(`products.status.${p.status}`)}
            </StatusBadge>
          </div>
        </div>
        <div className="shrink-0">{rowMenu(p)}</div>
      </li>
    );
  };

  return (
    <section>
      <PageHeader
        title={t('products.title')}
        description={t('products.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('products.new')}
          </ActionButton>
        }
      />

      {/* Search and Grouped Popover Filters bar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput
          ref={searchRef}
          value={q}
          onValueChange={setQ}
          onClear={resync}
          clearLabel={tCommon('actions.clear')}
          placeholder={t('products.searchPlaceholder')}
          className="w-full max-w-xs"
        />

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="size-4" aria-hidden />
              <span>{t('products.filter.title')}</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.2 text-xs font-semibold text-primary">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent closeLabel={tCommon('actions.close')} align="start" className="w-80">
            <h3 className="mb-3 pr-6 text-sm font-semibold">{t('products.filter.title')}</h3>
            <div className="flex flex-col gap-3">
              {/* Status */}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('products.filter.statusLabel')}
                <Select value={tab} onValueChange={(v) => handleTabChange(v as Tab)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TABS.map((tb) => (
                      <SelectItem key={tb} value={tb}>
                        {t(`products.filter.${tb}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {/* Origin Filter */}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('products.filter.originLabel')}
                <Select
                  value={originFilter}
                  onValueChange={(v) => setOriginFilter(v as OriginFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGIN_FILTERS.map((orig) => (
                      <SelectItem key={orig} value={orig}>
                        {orig === 'all'
                          ? t('products.origin.all')
                          : orig === '1p'
                            ? t('products.origin.oneP')
                            : t('products.origin.threeP')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {/* Category Filter */}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('products.filter.categoryLabel')}
                <Select
                  value={categoryFilter || '__all__'}
                  onValueChange={(v) => setCategoryFilter(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('products.allCategories')}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} title={c.name.en || c.slug}>
                        {c.name.en || c.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {/* Brand Filter */}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('products.filter.brandLabel')}
                <Select
                  value={brandFilter || '__all__'}
                  onValueChange={(v) => setBrandFilter(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('products.allBrands')}</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id} title={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {/* Clear inside popover */}
              <div className="pt-2 border-t border-border flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  disabled={!filtersActive}
                >
                  {t('products.filter.clear')}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {filtersActive && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            {t('products.filter.clear')}
          </Button>
        )}
      </div>

      {list.loadError && list.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-6 py-10 text-sm">
          <p className="text-destructive">{tCommon('list.loadError')}</p>
          <ActionButton variant="outline" size="sm" onClick={list.retry}>
            {tCommon('list.retry')}
          </ActionButton>
        </div>
      ) : list.loading && !highlighted ? (
        <ScrollLoadSkeleton />
      ) : emptyMsg ? (
        <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden rounded-md border border-border overflow-x-auto xl:block">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3 max-w-[240px]">{t('products.cols.title')}</TableHead>
                  <TableHead className="max-w-[160px]">{t('products.cols.category')}</TableHead>
                  <TableHead className="max-w-[140px]">{t('products.cols.brand')}</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[100px]">
                    {t('products.cols.price')}
                  </TableHead>
                  <TableHead className="whitespace-nowrap">{t('products.cols.status')}</TableHead>
                  <TableHead className="w-12 text-right">{t('products.cols.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effectiveHighlighted && desktopRow(effectiveHighlighted, { spotlight: true })}
                {list.items
                  .filter((p) => p.id !== effectiveHighlighted?.id)
                  .map((p) => desktopRow(p))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List View */}
          <ul className="divide-y divide-border rounded-md border border-border xl:hidden">
            {effectiveHighlighted && mobileCard(effectiveHighlighted, { spotlight: true })}
            {list.items.filter((p) => p.id !== effectiveHighlighted?.id).map((p) => mobileCard(p))}
          </ul>

          <div ref={list.sentinelRef} className="h-4" />
        </>
      )}

      <ScrollToTopButton label={tCommon('actions.backToTop')} />

      {modal && (
        <ProductFormModal
          open
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
          mode={modal.mode}
          product={'product' in modal ? modal.product : undefined}
          categories={categories}
          brands={brands}
          onSaved={onSaved}
          onDelete={(p) => {
            setModal(null);
            void doDelete(p);
          }}
          onConflict={() => {
            setModal(null);
            resync();
            notify.error(t('products.editConflict'));
          }}
        />
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={t('products.restoreTitle')}
        message={t('products.restoreMessage', {
          name: restoreTarget ? labelOf(restoreTarget) : '',
        })}
        confirmLabel={t('products.restore')}
        cancelLabel={tCommon('actions.cancel')}
        onConfirm={confirmRestore}
        loading={restoring}
      />

      <ProductOptionsDialog
        open={optionsProduct !== null}
        onOpenChange={(open) => {
          if (!open) setOptionsProduct(null);
        }}
        product={optionsProduct}
        onManageVariants={(p) => {
          setOptionsProduct(null);
          setVariantsProduct(p);
        }}
        onManageMedia={(p) => {
          setOptionsProduct(null);
          setMediaProduct(p);
        }}
      />

      <ProductVariantsDialog
        open={variantsProduct !== null}
        onOpenChange={(open) => {
          if (!open) setVariantsProduct(null);
        }}
        product={variantsProduct}
        onBackToOptions={(p) => {
          setVariantsProduct(null);
          setOptionsProduct(p);
        }}
        onManageMedia={(p) => {
          setVariantsProduct(null);
          setMediaProduct(p);
        }}
        onManageOffers={(p, variantId) => {
          setVariantsProduct(null);
          setOffersVariantId(variantId ?? null);
          setOffersProduct(p);
        }}
      />

      <ProductMediaDialog
        open={mediaProduct !== null}
        onOpenChange={(open) => {
          if (!open) setMediaProduct(null);
        }}
        product={mediaProduct}
        targetAssetId={searchParams.get('assetId')}
        onManageVariants={(p) => {
          setMediaProduct(null);
          setVariantsProduct(p);
        }}
        onConfigureOptions={(p) => {
          setMediaProduct(null);
          setOptionsProduct(p);
        }}
      />

      <ProductOffersDialog
        open={offersProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOffersProduct(null);
            setOffersVariantId(null);
          }
        }}
        product={offersProduct}
        initialVariantId={offersVariantId ?? searchParams.get('variantId')}
        onBackToVariants={(p) => {
          setOffersProduct(null);
          setVariantsProduct(p);
        }}
      />
    </section>
  );
}
