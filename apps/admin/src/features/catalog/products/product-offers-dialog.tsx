'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type {
  Buybox,
  Offer,
  Product,
  SellerWithShop,
  StockLevel,
  Variant,
  Warehouse,
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

function formatMoney(minor: string | null | undefined, currency: string = 'USD'): string {
  if (!minor) return '—';
  const val = (Number(minor) / 100).toFixed(2);
  return `${currency} $${val}`;
}

export function ProductOffersDialog({
  open,
  onOpenChange,
  product,
  initialVariantId,
  onBackToVariants,
}: ProductOffersDialogProps) {
  const t = useTranslations('catalog');
  const isArchived = product?.status === 'archived';

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sellers, setSellers] = useState<SellerWithShop[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [buybox, setBuybox] = useState<Buybox | null>(null);
  const [buyboxLoading, setBuyboxLoading] = useState(false);

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
  const loadData = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setLoadError(null);

    try {
      const [fetchedVariants, fetchedOffers, fetchedSellers, fetchedWarehouses] = await Promise.all(
        [listVariants(product.id), listProductOffers(product.id), listSellers(), listWarehouses()],
      );

      setVariants(fetchedVariants);
      setOffers(fetchedOffers);
      setSellers(fetchedSellers);
      setWarehouses(fetchedWarehouses);

      // Determine active variant
      let activeId = initialVariantId;
      if (!activeId || !fetchedVariants.some((v) => v.id === activeId)) {
        activeId = fetchedVariants[0]?.id ?? null;
      }
      setSelectedVariantId(activeId);
    } catch (err) {
      setLoadError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    } finally {
      setLoading(false);
    }
  }, [product, initialVariantId, t]);

  useEffect(() => {
    if (open && product) {
      void loadData();
    }
  }, [open, product, loadData]);

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
      if (product) void loadData();
    },
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
    if (selectedVariantId) void loadBuybox(selectedVariantId);
  };

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
    if (selectedVariantId) void loadBuybox(selectedVariantId);
  };

  const handleWarehouseCreated = (newWh: Warehouse) => {
    setWarehouses((prev) => [...prev, newWh]);
  };

  const openNewWarehouseModal = (sellerId?: string) => {
    const sId = sellerId || (sellers[0]?.id ?? '');
    const seller = sellers.find((s) => s.id === sId);
    setWarehouseModalState({
      open: true,
      sellerId: sId,
      sellerName: seller?.shop?.displayName ?? 'Seller',
    });
  };

  if (!product) return null;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-4xl max-h-[92vh] flex flex-col p-0">
          {/* Header */}
          <ModalHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ModalTitle>{t('products.offers.dialogTitle')}</ModalTitle>
                  {isArchived && (
                    <StatusBadge tone="neutral" className="text-xs">
                      Archived
                    </StatusBadge>
                  )}
                </div>
                <ModalDescription className="mt-1">
                  {isArchived
                    ? t('products.offers.dialogSubtitleArchived')
                    : t('products.offers.dialogSubtitle')}
                </ModalDescription>
              </div>

              {!isArchived && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openNewWarehouseModal()}
                    className="gap-1.5"
                  >
                    <Building2 className="size-3.5" />
                    {t('products.offers.addWarehouse')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOfferFormState({ open: true, offer: null })}
                    className="gap-1.5"
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
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
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
          <ModalBody className="flex-1 overflow-y-auto p-6 space-y-6">
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
                  onClick={loadData}
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
                    {!isArchived && (
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
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('products.offers.table.seller')}</TableHead>
                          <TableHead className="w-40">{t('products.offers.table.price')}</TableHead>
                          <TableHead className="w-28">
                            {t('products.offers.table.condition')}
                          </TableHead>
                          <TableHead className="w-48">{t('products.offers.table.stock')}</TableHead>
                          <TableHead className="w-28">
                            {t('products.offers.table.buybox')}
                          </TableHead>
                          <TableHead className="w-24">
                            {t('products.offers.table.status')}
                          </TableHead>
                          <TableHead className="w-24 text-right">
                            {t('products.offers.table.actions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeOffers.map((offer) => {
                          const isWinner = offer.isBuyboxWinner;
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
                                  <span className="text-xs text-muted-foreground">
                                    /{offer.shopSlug}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5 font-mono">
                                    {hasSale ? (
                                      <>
                                        <span className="font-semibold text-primary">
                                          {formatMoney(offer.salePriceMinor, offer.currency)}
                                        </span>
                                        <span className="text-xs text-muted-foreground line-through">
                                          {formatMoney(offer.priceMinor, offer.currency)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-semibold text-foreground">
                                        {formatMoney(offer.priceMinor, offer.currency)}
                                      </span>
                                    )}
                                  </div>
                                  {hasSale && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                                      <Sparkles className="size-2.5" />
                                      {t('products.offers.table.sale')}
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
                                  <div className="flex items-center gap-1.5">
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
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">
                                    {offer.stocks.length} warehouses
                                  </span>
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

                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setStockAdjustState({ open: true, offer })}
                                        aria-label={t('products.offers.adjustStock')}
                                      >
                                        <Boxes className="size-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t('products.offers.adjustStock')}
                                    </TooltipContent>
                                  </Tooltip>

                                  {!isArchived && (
                                    <>
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
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </ModalBody>

          {/* Footer */}
          <ModalFooter className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between">
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
                  className="gap-1.5"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('products.variants.dialogTitle')}
                </Button>
              )}
            </div>

            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
      />

      {/* Stock Adjust Modal */}
      <StockAdjustModal
        open={stockAdjustState.open}
        onOpenChange={(open) => setStockAdjustState((prev) => ({ ...prev, open }))}
        offer={stockAdjustState.offer}
        warehouses={warehouses.filter((w) => w.sellerId === stockAdjustState.offer?.sellerId)}
        onStockUpdated={handleStockUpdated}
        onNewWarehouseRequested={() => openNewWarehouseModal(stockAdjustState.offer?.sellerId)}
      />

      {/* Warehouse Form Modal */}
      <WarehouseFormModal
        open={warehouseModalState.open}
        onOpenChange={(open) => setWarehouseModalState((prev) => ({ ...prev, open }))}
        sellerId={warehouseModalState.sellerId}
        sellerName={warehouseModalState.sellerName}
        onCreated={handleWarehouseCreated}
      />
    </>
  );
}
