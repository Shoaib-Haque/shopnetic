'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building2,
  Edit2,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  type Buybox,
  type Offer,
  type Product,
  type SellerWithShop,
  type StockLevel,
  type Variant,
  type Warehouse,
  formatMoney,
} from '@shopnetic/contracts';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Skeleton,
  Spinner,
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
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { useSoftDeleteWithUndo } from '@/components/crud/use-soft-delete-with-undo';
import {
  deleteOffer,
  getVariantBuybox,
  listProductOffers,
  listSellers,
  listVariants,
  listWarehouses,
  restoreOffer,
} from './api';
import { OfferFormModal } from './offer-form-modal';
import { StockAdjustModal } from './stock-adjust-modal';
import { WarehouseFormModal } from './warehouse-form-modal';

export interface ProductOffersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  initialVariantId?: string | null;
  onBackToVariants?: (product: Product) => void;
}

export function ProductOffersDialog({
  open,
  onOpenChange,
  product,
  initialVariantId,
  onBackToVariants,
}: ProductOffersDialogProps) {
  const t = useTranslations('catalog');
  const isArchived = product?.status === 'archived' || Boolean(product?.archivedAt);
  const isPending = product?.status === 'pending';
  const isReadOnly = isArchived || isPending;

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sellers, setSellers] = useState<SellerWithShop[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [buybox, setBuybox] = useState<Buybox | null>(null);
  const [buyboxLoading, setBuyboxLoading] = useState(false);

  const selectedVariantIdRef = useRef<string | null>(null);
  selectedVariantIdRef.current = selectedVariantId;

  const lastSyncedInitialVariantIdRef = useRef<string | undefined>(undefined);

  // Sub-modal states
  const [offerFormState, setOfferFormState] = useState<{
    open: boolean;
    offer: Offer | null;
  }>({ open: false, offer: null });

  const [stockAdjustState, setStockAdjustState] = useState<{
    open: boolean;
    offer: Offer | null;
  }>({ open: false, offer: null });

  const [warehouseModalState, setWarehouseModalState] = useState<{
    open: boolean;
    sellerId: string;
    sellerName: string;
  }>({ open: false, sellerId: '', sellerName: '' });

  // Load all initial data for product
  const loadData = useCallback(
    async ({
      preserveSelected = false,
      background = false,
    }: { preserveSelected?: boolean; background?: boolean } = {}) => {
      if (!product) return;
      if (!background) {
        setLoading(true);
        setLoadError(null);
      }

      try {
        const [fetchedVariants, fetchedOffers, fetchedSellers, fetchedWarehouses] =
          await Promise.all([
            listVariants(product.id),
            listProductOffers(product.id),
            listSellers(),
            listWarehouses(),
          ]);

        setVariants(fetchedVariants);
        setOffers(fetchedOffers);
        setSellers(fetchedSellers);
        setWarehouses(fetchedWarehouses);

        const currentSelected = selectedVariantIdRef.current;
        let activeId: string | null = null;

        if (
          preserveSelected &&
          currentSelected &&
          fetchedVariants.some((v) => v.id === currentSelected)
        ) {
          activeId = currentSelected;
        } else if (initialVariantId && fetchedVariants.some((v) => v.id === initialVariantId)) {
          activeId = initialVariantId;
          lastSyncedInitialVariantIdRef.current = initialVariantId;
        } else {
          activeId = fetchedVariants[0]?.id ?? null;
          lastSyncedInitialVariantIdRef.current = activeId ?? undefined;
        }

        setSelectedVariantId(activeId);
      } catch (err) {
        setLoadError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
      } finally {
        if (!background) setLoading(false);
      }
    },
    [product, initialVariantId, t],
  );

  useEffect(() => {
    if (open && product) {
      void loadData();
    }
  }, [open, product, loadData]);

  // Deep-link variant selection sync: only update if initialVariantId prop changed
  useEffect(() => {
    if (!open) {
      lastSyncedInitialVariantIdRef.current = undefined;
      return;
    }
    if (
      initialVariantId &&
      initialVariantId !== lastSyncedInitialVariantIdRef.current &&
      variants.some((v) => v.id === initialVariantId)
    ) {
      lastSyncedInitialVariantIdRef.current = initialVariantId;
      setSelectedVariantId(initialVariantId);
    }
  }, [open, initialVariantId, variants]);

  // Load buybox whenever selectedVariantId changes
  const loadBuybox = useCallback(async (vId: string) => {
    setBuyboxLoading(true);
    try {
      const box = await getVariantBuybox(vId);
      setBuybox(box);
    } catch {
      setBuybox(null);
    } finally {
      setBuyboxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVariantId) {
      void loadBuybox(selectedVariantId);
    } else {
      setBuybox(null);
    }
  }, [selectedVariantId, loadBuybox]);

  // Filter offers for active variant
  const activeOffers = useMemo(() => {
    if (!selectedVariantId) return offers;
    return offers.filter((o) => o.variantId === selectedVariantId);
  }, [offers, selectedVariantId]);

  // Soft-delete hook with undo
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { doDelete } = useSoftDeleteWithUndo<Offer>({
    deleteItem: (id) => deleteOffer(id),
    restoreItem: (id) => restoreOffer(id),
    resync: () => {
      if (product) void loadData({ preserveSelected: true, background: true });
      const currentVid = selectedVariantIdRef.current;
      if (currentVid) void loadBuybox(currentVid);
    },
    onOptimisticRemove: (o) => setOffers((prev) => prev.filter((x) => x.id !== o.id)),
    onOptimisticRestore: (o) =>
      setOffers((prev) => (prev.some((x) => x.id === o.id) ? prev : [o, ...prev])),
    labelOf: (o) => (o ? `${o.sellerName} (${o.skuCode})` : 'Offer'),
    messages: {
      deleted: () => t('products.offers.toast.offerDeleted'),
      restored: () => t('products.offers.toast.offerCreated'),
      alreadyDeleted: () => t('products.offers.toast.offerDeleted'),
      alreadyRestored: () => t('products.offers.toast.offerCreated'),
      undoLabel: t('valueSets.undo'),
    },
    onError: (err) => {
      notify.error(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    },
  });

  const handleDeleteOffer = async (offer: Offer) => {
    setDeletingId(offer.id);
    try {
      await doDelete(offer);
    } finally {
      setDeletingId(null);
    }
  };

  // Handlers for saved / updated items
  const handleOfferSaved = (saved: Offer) => {
    setOffers((prev) => {
      const idx = prev.findIndex((o) => o.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    const currentVid = selectedVariantIdRef.current;
    if (currentVid) void loadBuybox(currentVid);
  };

  const handleConflictResync = useCallback(() => {
    if (product) void loadData({ preserveSelected: true, background: true });
    const currentVid = selectedVariantIdRef.current;
    if (currentVid) void loadBuybox(currentVid);
  }, [product, loadData, loadBuybox]);

  const handleStockUpdated = (offerId: string, level: StockLevel) => {
    setOffers((prev) =>
      prev.map((o) => {
        if (o.id !== offerId) return o;
        const existingStockIdx = o.stocks.findIndex((s) => s.id === level.id);
        const nextStocks = [...o.stocks];
        if (existingStockIdx >= 0) {
          nextStocks[existingStockIdx] = level;
        } else {
          nextStocks.push(level);
        }
        const totalOnHand = nextStocks.reduce((sum, s) => sum + s.onHand, 0);
        const totalAvailable = nextStocks.reduce((sum, s) => sum + s.available, 0);
        return {
          ...o,
          stocks: nextStocks,
          totalOnHand,
          totalAvailable,
        };
      }),
    );

    setStockAdjustState((curr) => {
      if (!curr.offer || curr.offer.id !== offerId) return curr;
      const existingStockIdx = curr.offer.stocks.findIndex((s) => s.id === level.id);
      const nextStocks = [...curr.offer.stocks];
      if (existingStockIdx >= 0) {
        nextStocks[existingStockIdx] = level;
      } else {
        nextStocks.push(level);
      }
      const totalOnHand = nextStocks.reduce((sum, s) => sum + s.onHand, 0);
      const totalAvailable = nextStocks.reduce((sum, s) => sum + s.available, 0);
      return {
        ...curr,
        offer: {
          ...curr.offer,
          stocks: nextStocks,
          totalOnHand,
          totalAvailable,
        },
      };
    });

    const currentVid = selectedVariantIdRef.current;
    if (currentVid) void loadBuybox(currentVid);
  };

  const handleWarehouseCreated = (newWh: Warehouse) => {
    setWarehouses((prev) => [...prev, newWh]);
  };

  const openNewWarehouseModal = (sellerId?: string) => {
    const sId = sellerId ?? '';
    const seller = sId ? sellers.find((s) => s.id === sId) : undefined;
    setWarehouseModalState({
      open: true,
      sellerId: sId,
      sellerName: seller ? (seller.shop?.displayName ?? seller.legalName ?? 'Seller') : '',
    });
  };

  const sellerWarehouses = useMemo(() => {
    return warehouses.filter((w) => w.sellerId === stockAdjustState.offer?.sellerId);
  }, [warehouses, stockAdjustState.offer?.sellerId]);

  if (!product) return null;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
          {/* Header */}
          <ModalHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <ModalTitle>{t('products.offers.dialogTitle')}</ModalTitle>
                  {product && (
                    <span
                      className="max-w-xs sm:max-w-sm truncate text-sm font-normal text-muted-foreground"
                      title={product.title?.en ?? product.slug}
                    >
                      — {product.title?.en ?? product.slug}
                    </span>
                  )}
                  {isArchived && (
                    <StatusBadge tone="neutral" className="text-xs">
                      {t('products.status.archived')}
                    </StatusBadge>
                  )}
                  {isPending && (
                    <StatusBadge tone="warning" className="text-xs">
                      {t('products.status.pending')}
                    </StatusBadge>
                  )}
                </div>
                <ModalDescription className="mt-1">
                  {isArchived
                    ? t('products.offers.dialogSubtitleArchived')
                    : isPending
                      ? t('products.offers.dialogSubtitlePending')
                      : t('products.offers.dialogSubtitle')}
                </ModalDescription>
              </div>

              {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openNewWarehouseModal()}
                    className="w-full sm:w-auto gap-1.5"
                  >
                    <Building2 className="size-3.5" />
                    {t('products.offers.addWarehouse')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOfferFormState({ open: true, offer: null })}
                    className="w-full sm:w-auto gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    {t('products.offers.createOffer')}
                  </Button>
                </div>
              )}
            </div>

            {/* Variant Selector Tabs */}
            {variants.length > 0 && (
              <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {variants.map((v) => {
                  const isSelected = v.id === selectedVariantId;
                  const vOffersCount = offers.filter((o) => o.variantId === v.id).length;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0 whitespace-nowrap ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span className="font-mono">{v.skuCode || 'Variant'}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                          isSelected
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-background text-muted-foreground'
                        }`}
                      >
                        {vOffersCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </ModalHeader>

          {/* Body */}
          <ModalBody className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="size-8 text-destructive mb-2" />
                <p className="text-sm font-medium text-destructive">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadData({ preserveSelected: true })}
                  className="mt-4"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {/* Buy-Box Diagnostic Card */}
                {selectedVariantId && (
                  <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-r from-card to-card/50 p-4 shadow-sm">
                    {buyboxLoading ? (
                      <Skeleton className="h-16 w-full" />
                    ) : buybox && buybox.winningOfferId ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                            <Trophy className="size-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('products.offers.buybox.title')}
                              </span>
                              <StatusBadge tone="success" className="text-[10px] uppercase">
                                {t('products.offers.badges.winner')}
                              </StatusBadge>
                            </div>
                            <h3 className="text-base font-bold text-foreground">
                              {buybox.winningSellerName ?? 'Winning Seller'}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {t('products.offers.buybox.competingSellers', {
                                count: buybox.sellerCount,
                              })}
                              {buybox.minPriceMinor && buybox.maxPriceMinor && (
                                <>
                                  {' '}
                                  •{' '}
                                  {t('products.offers.buybox.priceRange', {
                                    min: formatMoney(
                                      buybox.minPriceMinor,
                                      buybox.winningCurrency ?? 'USD',
                                    ),
                                    max: formatMoney(
                                      buybox.maxPriceMinor,
                                      buybox.winningCurrency ?? 'USD',
                                    ),
                                  })}
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end">
                          <span className="text-xs text-muted-foreground">
                            {t('products.offers.buybox.winningPrice')}
                          </span>
                          <span className="text-xl font-bold font-mono text-primary">
                            {formatMoney(buybox.winningPriceMinor, buybox.winningCurrency ?? 'USD')}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2 text-muted-foreground">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <ShoppingBag className="size-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {t('products.offers.buybox.noWinner')}
                          </p>
                          <p className="text-xs">{t('products.offers.buybox.noWinnerDesc')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Offers Table */}
                {activeOffers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <Boxes className="mx-auto size-9 text-muted-foreground/60" aria-hidden />
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {t('products.offers.emptyTitle')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('products.offers.emptySubtitle')}
                    </p>
                    {!isReadOnly && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setOfferFormState({ open: true, offer: null })}
                        className="mt-4 gap-1.5"
                      >
                        <Plus className="size-3.5" />
                        {t('products.offers.createOffer')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View (sm:hidden) */}
                    <div className="sm:hidden space-y-3">
                      {activeOffers.map((offer) => {
                        const isWinner = Boolean(
                          buybox?.winningOfferId && offer.id === buybox.winningOfferId,
                        );
                        const now = new Date();
                        const hasSale = Boolean(
                          offer.salePriceMinor &&
                            (!offer.saleStartsAt || new Date(offer.saleStartsAt) <= now) &&
                            (!offer.saleEndsAt || new Date(offer.saleEndsAt) >= now),
                        );
                        const isDeleting = deletingId === offer.id;

                        return (
                          <div
                            key={offer.id}
                            className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm"
                          >
                            {/* Top Row: Seller name, badges, status */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-sm text-foreground">
                                    {offer.sellerName}
                                  </span>
                                  <StatusBadge
                                    tone={
                                      offer.shopSlug === 'shopnetic-retail' ? 'neutral' : 'warning'
                                    }
                                    className="text-[9px]"
                                  >
                                    {offer.shopSlug === 'shopnetic-retail' ? '1P' : '3P'}
                                  </StatusBadge>
                                  {isWinner ? (
                                    <StatusBadge tone="success" className="gap-1 text-[10px]">
                                      <Trophy className="size-3" />
                                      {t('products.offers.badges.winner')}
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="neutral" className="text-[10px]">
                                      {t('products.offers.badges.competing')}
                                    </StatusBadge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground font-mono">
                                  /{offer.shopSlug}
                                </span>
                              </div>
                              <StatusBadge
                                tone={offer.status === 'active' ? 'success' : 'neutral'}
                                className="text-[10px] capitalize shrink-0"
                              >
                                {offer.status}
                              </StatusBadge>
                            </div>

                            {/* Metrics Grid: Price, Stock */}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50 text-xs">
                              <div>
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                                  {t('products.offers.table.price')}
                                </span>
                                <div className="flex flex-col gap-0.5 mt-0.5 font-mono">
                                  {hasSale ? (
                                    <>
                                      <span className="font-semibold text-primary text-sm">
                                        {formatMoney(offer.salePriceMinor, offer.currency)}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground line-through">
                                        {formatMoney(offer.priceMinor, offer.currency)}
                                      </span>
                                      <span className="inline-flex items-center gap-1 text-[10px] text-primary font-sans w-fit">
                                        <Sparkles className="size-2.5" />
                                        {t('products.offers.table.sale')}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="font-semibold text-foreground text-sm">
                                      {formatMoney(offer.priceMinor, offer.currency)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                                  {t('products.offers.table.stock')}
                                </span>
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <span
                                    className={`font-semibold font-mono ${
                                      offer.totalAvailable > 0 ? 'text-success' : 'text-destructive'
                                    }`}
                                  >
                                    {offer.totalAvailable} avail
                                  </span>
                                  <span className="text-muted-foreground text-[11px]">
                                    ({offer.totalOnHand} on hand)
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {offer.stocks.length} warehouses
                                  </span>
                                  {offer.stocks.some((s) => s.backorder) && (
                                    <StatusBadge tone="neutral" className="text-[9px] w-fit mt-0.5">
                                      {t('products.offers.badges.backorderAvailable')}
                                    </StatusBadge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Footer: Condition & Actions */}
                            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                              <span className="text-muted-foreground">
                                Condition:{' '}
                                <strong className="text-foreground capitalize">
                                  {t(`products.offers.condition.${offer.condition}`)}
                                </strong>
                              </span>

                              {!isReadOnly && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStockAdjustState({ open: true, offer })}
                                    className="h-8 w-8 p-0"
                                    aria-label={t('products.offers.adjustStock')}
                                  >
                                    <Boxes className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setOfferFormState({ open: true, offer })}
                                    className="h-8 w-8 p-0"
                                    aria-label={t('products.offers.editOffer')}
                                  >
                                    <Edit2 className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isDeleting}
                                    onClick={() => void handleDeleteOffer(offer)}
                                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={t('products.offers.deleteOffer')}
                                  >
                                    {isDeleting ? (
                                      <Spinner className="size-3.5" />
                                    ) : (
                                      <Trash2 className="size-3.5" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table View (hidden sm:block) */}
                    <div className="hidden sm:block rounded-xl border border-border overflow-x-auto">
                      <Table className="min-w-[680px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('products.offers.table.seller')}</TableHead>
                            <TableHead className="w-36">
                              {t('products.offers.table.price')}
                            </TableHead>
                            <TableHead className="w-28">
                              {t('products.offers.table.condition')}
                            </TableHead>
                            <TableHead className="w-44">
                              {t('products.offers.table.stock')}
                            </TableHead>
                            <TableHead className="w-28">
                              {t('products.offers.table.buybox')}
                            </TableHead>
                            <TableHead className="w-24">
                              {t('products.offers.table.status')}
                            </TableHead>
                            {!isReadOnly && (
                              <TableHead className="w-24 text-right">
                                {t('products.offers.table.actions')}
                              </TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeOffers.map((offer) => {
                            const isWinner = Boolean(
                              buybox?.winningOfferId && offer.id === buybox.winningOfferId,
                            );
                            const now = new Date();
                            const hasSale = Boolean(
                              offer.salePriceMinor &&
                                (!offer.saleStartsAt || new Date(offer.saleStartsAt) <= now) &&
                                (!offer.saleEndsAt || new Date(offer.saleEndsAt) >= now),
                            );
                            const isDeleting = deletingId === offer.id;

                            return (
                              <TableRow key={offer.id}>
                                <TableCell>
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-foreground">
                                        {offer.sellerName}
                                      </span>
                                      {offer.shopSlug === 'shopnetic-retail' ? (
                                        <StatusBadge tone="neutral" className="text-[10px]">
                                          1P
                                        </StatusBadge>
                                      ) : (
                                        <StatusBadge tone="warning" className="text-[10px]">
                                          3P
                                        </StatusBadge>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground font-mono">
                                      /{offer.shopSlug}
                                    </span>
                                  </div>
                                </TableCell>

                                <TableCell>
                                  <div className="flex flex-col gap-0.5 text-xs font-mono">
                                    {hasSale ? (
                                      <>
                                        <span className="font-semibold text-primary">
                                          {formatMoney(offer.salePriceMinor, offer.currency)}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground line-through">
                                          {formatMoney(offer.priceMinor, offer.currency)}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[10px] text-primary w-fit font-sans">
                                          <Sparkles className="size-2.5" />
                                          {t('products.offers.table.sale')}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-semibold text-foreground">
                                        {formatMoney(offer.priceMinor, offer.currency)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-default text-xs capitalize text-foreground">
                                        {t(`products.offers.condition.${offer.condition}`)}
                                      </span>
                                    </TooltipTrigger>
                                    {offer.conditionNotes && (
                                      <TooltipContent>
                                        <p className="max-w-xs text-xs">{offer.conditionNotes}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TableCell>

                                <TableCell>
                                  <div className="flex flex-col gap-0.5 text-xs">
                                    <span
                                      className={`font-semibold font-mono ${
                                        offer.totalAvailable > 0
                                          ? 'text-success'
                                          : 'text-destructive'
                                      }`}
                                    >
                                      {offer.totalAvailable} avail
                                    </span>
                                    <span className="text-muted-foreground">
                                      ({offer.totalOnHand} on hand)
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {offer.stocks.length} warehouses
                                    </span>
                                    {offer.stocks.some((s) => s.backorder) && (
                                      <StatusBadge
                                        tone="neutral"
                                        className="text-[10px] w-fit mt-0.5"
                                      >
                                        {t('products.offers.badges.backorderAvailable')}
                                      </StatusBadge>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell>
                                  {isWinner ? (
                                    <StatusBadge tone="success" className="gap-1 text-[10px]">
                                      <Trophy className="size-3" />
                                      {t('products.offers.badges.winner')}
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="neutral" className="text-[10px]">
                                      {t('products.offers.badges.competing')}
                                    </StatusBadge>
                                  )}
                                </TableCell>

                                <TableCell>
                                  <StatusBadge
                                    tone={offer.status === 'active' ? 'success' : 'neutral'}
                                    className="text-[10px] capitalize"
                                  >
                                    {offer.status}
                                  </StatusBadge>
                                </TableCell>

                                {!isReadOnly && (
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setStockAdjustState({ open: true, offer })
                                            }
                                            aria-label={t('products.offers.adjustStock')}
                                          >
                                            <Boxes className="size-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {t('products.offers.adjustStock')}
                                        </TooltipContent>
                                      </Tooltip>

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setOfferFormState({ open: true, offer })}
                                            aria-label={t('products.offers.editOffer')}
                                          >
                                            <Edit2 className="size-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {t('products.offers.editOffer')}
                                        </TooltipContent>
                                      </Tooltip>

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={isDeleting}
                                            onClick={() => void handleDeleteOffer(offer)}
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            aria-label={t('products.offers.deleteOffer')}
                                          >
                                            {isDeleting ? (
                                              <Spinner className="size-3.5" />
                                            ) : (
                                              <Trash2 className="size-3.5" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {t('products.offers.deleteOffer')}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </>
            )}
          </ModalBody>

          {/* Footer */}
          <ModalFooter className="px-6 py-4 border-t border-border shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div>
              {onBackToVariants && product && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onBackToVariants(product);
                  }}
                  className="w-full sm:w-auto gap-1.5"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('products.variants.dialogTitle')}
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Offer Form Modal (Create / Edit) */}
      <OfferFormModal
        open={offerFormState.open}
        onOpenChange={(open) => setOfferFormState((prev) => ({ ...prev, open }))}
        product={product}
        variants={variants}
        selectedVariantId={selectedVariantId ?? undefined}
        offer={offerFormState.offer}
        sellers={sellers}
        warehouses={warehouses}
        onSaved={handleOfferSaved}
        onNewWarehouseRequested={(sId) => openNewWarehouseModal(sId)}
        onConflict={handleConflictResync}
      />

      {/* Stock Adjust Modal */}
      <StockAdjustModal
        open={stockAdjustState.open}
        onOpenChange={(open) => setStockAdjustState((prev) => ({ ...prev, open }))}
        offer={stockAdjustState.offer}
        warehouses={sellerWarehouses}
        onStockUpdated={handleStockUpdated}
        onNewWarehouseRequested={() => openNewWarehouseModal(stockAdjustState.offer?.sellerId)}
        onConflict={handleConflictResync}
      />

      {/* Warehouse Form Modal */}
      <WarehouseFormModal
        open={warehouseModalState.open}
        onOpenChange={(open) => setWarehouseModalState((prev) => ({ ...prev, open }))}
        sellerId={warehouseModalState.sellerId}
        sellerName={warehouseModalState.sellerName}
        sellers={sellers}
        onCreated={handleWarehouseCreated}
      />
    </>
  );
}
