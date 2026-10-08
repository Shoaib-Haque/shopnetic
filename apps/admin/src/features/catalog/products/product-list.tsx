'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  Brand,
  Category,
  Product,
  ProductListStatus,
  ProductOrigin,
} from '@shopnetic/contracts';
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
import { deleteProduct, getProduct, listProductsPage, restoreProduct } from './api';

type Tab = ProductListStatus;
const TABS: Tab[] = ['active', 'pending', 'draft', 'archived', 'all'];

function parseTab(v: string | null): Tab {
  if (v === 'pending' || v === 'draft' || v === 'archived' || v === 'all') return v;
  return 'active';
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
  const val = (Number(basePriceMinor) / 100).toFixed(2);
  return currency ? `${currency} ${val}` : `$${val}`;
}

const selectFilterCls =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]';

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
    tab: tab !== 'active' ? tab : undefined,
    origin: originFilter !== 'all' ? originFilter : undefined,
    category: categoryFilter || undefined,
    brand: brandFilter || undefined,
    q: debouncedQ,
  });

  const [modal, setModal] = useState<ModalState>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCategories({ status: 'all' })
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {});
    listBrandsPage({ limit: 100 })
      .then((bRes) => {
        if (!cancelled) setBrands(bRes.brands);
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

  function onSaved(action: 'created' | 'updated', p: Product): void {
    notify.saved(t(`products.toast.${action}`, { title: labelOf(p) }));
    if (action === 'updated') {
      list.setItems((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      if (effectiveHighlighted?.id === p.id) setHighlighted(p);
    } else {
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
            <DropdownMenuItem
              onSelect={() => void doDelete(p)}
              className="text-destructive focus:text-destructive"
            >
              {t('products.delete')}
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
    const catName = cat ? cat.name.en || cat.slug : p.categoryId;
    const brand = p.brandId ? brandMap.get(p.brandId) : null;
    const brandName = brand ? brand.name : p.brandId ? '—' : t('products.unbranded');

    return (
      <TableRow
        key={p.id}
        data-product-row={p.id}
        className={cn('scroll-my-24', opts?.spotlight && 'bg-primary/5')}
      >
        <TableCell className="pl-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{p.title?.en ?? p.slug}</span>
              {p.proposedBySellerId ? (
                <StatusBadge tone="warning">{t('products.originBadges.threeP')}</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">{t('products.originBadges.oneP')}</StatusBadge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">/{p.slug}</span>
          </div>
        </TableCell>
        <TableCell className="text-sm text-foreground">{catName}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{brandName}</TableCell>
        <TableCell className="text-sm font-mono text-muted-foreground">
          {formatPrice(p.basePriceMinor, p.currency)}
        </TableCell>
        <TableCell>
          <StatusBadge tone={STATUS_TONE[p.status]}>{t(`products.status.${p.status}`)}</StatusBadge>
        </TableCell>
        <TableCell>{rowMenu(p)}</TableCell>
      </TableRow>
    );
  };

  const mobileCard = (p: Product, opts?: { spotlight?: boolean }): ReactNode => {
    const cat = categoryMap.get(p.categoryId);
    const catName = cat ? cat.name.en || cat.slug : p.categoryId;
    const brand = p.brandId ? brandMap.get(p.brandId) : null;
    const brandName = brand ? brand.name : p.brandId ? '—' : t('products.unbranded');

    return (
      <li
        key={p.id}
        data-product-row={p.id}
        className={cn('flex items-start gap-3 px-3 py-3', opts?.spotlight && 'bg-primary/5')}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{p.title?.en ?? p.slug}</span>
            {p.proposedBySellerId ? (
              <StatusBadge tone="warning">{t('products.originBadges.threeP')}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">{t('products.originBadges.oneP')}</StatusBadge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">/{p.slug}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{catName}</span>
            <span>•</span>
            <span>{brandName}</span>
            <span>•</span>
            <span className="font-mono">{formatPrice(p.basePriceMinor, p.currency)}</span>
          </div>
          <div className="mt-1.5">
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

      {/* Search, tabs, and filters bar */}
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

        {/* Status Tabs */}
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
              {t(`products.filter.${tb}`)}
            </button>
          ))}
        </div>

        {/* Origin Filter */}
        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}
          className={selectFilterCls}
        >
          {ORIGIN_FILTERS.map((orig) => (
            <option key={orig} value={orig}>
              {orig === 'all'
                ? t('products.origin.all')
                : orig === '1p'
                  ? t('products.origin.oneP')
                  : t('products.origin.threeP')}
            </option>
          ))}
        </select>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={selectFilterCls}
        >
          <option value="">{t('products.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name.en || c.slug}
            </option>
          ))}
        </select>

        {/* Brand Filter */}
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className={selectFilterCls}
        >
          <option value="">{t('products.allBrands')}</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
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
          <div className="hidden rounded-md border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3">{t('products.cols.title')}</TableHead>
                  <TableHead>{t('products.cols.category')}</TableHead>
                  <TableHead>{t('products.cols.brand')}</TableHead>
                  <TableHead>{t('products.cols.price')}</TableHead>
                  <TableHead>{t('products.cols.status')}</TableHead>
                  <TableHead className="w-12">{t('products.cols.actions')}</TableHead>
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
          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
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
        title={t('products.restore')}
        message={t('products.toast.restored', {
          title: restoreTarget ? labelOf(restoreTarget) : '',
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
      />
    </section>
  );
}
