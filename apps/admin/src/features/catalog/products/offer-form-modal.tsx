'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Plus, Sparkles } from 'lucide-react';
import type {
  CreateOfferRequest,
  Currency,
  Offer,
  OfferCondition,
  OfferStatus,
  Product,
  SellerWithShop,
  UpdateOfferRequest,
  Variant,
  Warehouse,
} from '@shopnetic/contracts';
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Spinner,
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createOffer, updateOffer } from './api';

export interface OfferFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  variants: Variant[];
  selectedVariantId?: string | null | undefined;
  offer: Offer | null;
  sellers: SellerWithShop[];
  warehouses: Warehouse[];
  onSaved: (saved: Offer) => void;
  onNewWarehouseRequested?: (sellerId: string) => void;
}

const selectCls =
  'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)] disabled:cursor-not-allowed disabled:opacity-50';

const CONDITIONS: OfferCondition[] = [
  'new',
  'refurbished_like_new',
  'refurbished_good',
  'used_like_new',
  'used_good',
  'used_fair',
];

function minorToDecimal(minor: string | null | undefined): string {
  if (!minor) return '';
  return (Number(minor) / 100).toFixed(2);
}

function decimalToMinor(decimal: string): string | null {
  const trimmed = decimal.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100).toString();
}

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OfferFormModal({
  open,
  onOpenChange,
  product,
  variants,
  selectedVariantId,
  offer,
  sellers,
  warehouses,
  onSaved,
  onNewWarehouseRequested,
}: OfferFormModalProps) {
  const t = useTranslations('catalog');
  const isEditing = Boolean(offer);

  const defaultSeller = useMemo(() => {
    return sellers.find((s) => s.shop?.slug === 'shopnetic-retail') ?? sellers[0];
  }, [sellers]);

  const [sellerId, setSellerId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [salePrice, setSalePrice] = useState('');
  const [saleStartsAt, setSaleStartsAt] = useState('');
  const [saleEndsAt, setSaleEndsAt] = useState('');
  const [condition, setCondition] = useState<OfferCondition>('new');
  const [conditionNotes, setConditionNotes] = useState('');
  const [handlingDays, setHandlingDays] = useState(1);
  const [minQty, setMinQty] = useState(1);
  const [maxQty, setMaxQty] = useState('');
  const [initialStock, setInitialStock] = useState(0);
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState<OfferStatus>('active');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when opening modal
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (offer) {
      setSellerId(offer.sellerId);
      setVariantId(offer.variantId);
      setPrice(minorToDecimal(offer.priceMinor));
      setCurrency(offer.currency);
      setSalePrice(minorToDecimal(offer.salePriceMinor));
      setSaleStartsAt(toLocalDatetimeInput(offer.saleStartsAt));
      setSaleEndsAt(toLocalDatetimeInput(offer.saleEndsAt));
      setCondition(offer.condition);
      setConditionNotes(offer.conditionNotes ?? '');
      setHandlingDays(offer.handlingDays);
      setMinQty(offer.minQty);
      setMaxQty(offer.maxQty != null ? String(offer.maxQty) : '');
      setInitialStock(0);
      setWarehouseId('');
      setStatus(offer.status);
    } else {
      setSellerId(defaultSeller ? defaultSeller.id : '');
      setVariantId(selectedVariantId ?? (variants[0] ? variants[0].id : ''));
      setPrice(product.basePriceMinor ? minorToDecimal(product.basePriceMinor) : '29.99');
      setCurrency(product.currency ?? 'USD');
      setSalePrice('');
      setSaleStartsAt('');
      setSaleEndsAt('');
      setCondition('new');
      setConditionNotes('');
      setHandlingDays(1);
      setMinQty(1);
      setMaxQty('');
      setInitialStock(10);
      setStatus('active');
    }
  }, [open, offer, defaultSeller, selectedVariantId, variants, product]);

  // Filter warehouses for chosen seller
  const sellerWarehouses = useMemo(() => {
    const activeSellerId = isEditing && offer ? offer.sellerId : sellerId;
    return warehouses.filter((w) => w.sellerId === activeSellerId);
  }, [warehouses, isEditing, offer, sellerId]);

  // Auto-select default warehouse when seller changes
  useEffect(() => {
    if (sellerWarehouses.length > 0 && !warehouseId) {
      const def = sellerWarehouses.find((w) => w.isDefault) ?? sellerWarehouses[0];
      if (def) setWarehouseId(def.id);
    }
  }, [sellerWarehouses, warehouseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceMinor = decimalToMinor(price);
    if (!priceMinor || BigInt(priceMinor) <= 0n) {
      setError(t('products.offers.form.err.priceRequired'));
      return;
    }

    if (!isEditing && !sellerId) {
      setError(t('products.offers.form.err.sellerRequired'));
      return;
    }

    if (!isEditing && !variantId) {
      setError(t('products.offers.form.err.variantRequired'));
      return;
    }

    const salePriceMinor = decimalToMinor(salePrice);

    setSubmitting(true);

    try {
      if (isEditing && offer) {
        const updateBody: UpdateOfferRequest = {
          priceMinor,
          currency: currency.toUpperCase() as Currency,
          salePriceMinor: salePriceMinor,
          saleStartsAt: saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
          saleEndsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
          condition,
          conditionNotes: conditionNotes.trim() || null,
          handlingDays,
          status,
          minQty,
          maxQty: maxQty.trim() ? parseInt(maxQty, 10) : null,
          expectedUpdatedAt: offer.updatedAt,
        };

        const updated = await updateOffer(offer.id, updateBody);
        notify.saved(t('products.offers.toast.offerUpdated'));
        onSaved(updated);
        onOpenChange(false);
      } else {
        const createBody: CreateOfferRequest = {
          sellerId,
          variantId,
          priceMinor,
          currency: currency.toUpperCase() as Currency,
          salePriceMinor: salePriceMinor ?? undefined,
          saleStartsAt: saleStartsAt ? new Date(saleStartsAt).toISOString() : undefined,
          saleEndsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : undefined,
          condition,
          conditionNotes: conditionNotes.trim() || undefined,
          handlingDays,
          minQty,
          maxQty: maxQty.trim() ? parseInt(maxQty, 10) : undefined,
          initialStock: Math.max(0, initialStock),
          warehouseId: warehouseId || undefined,
        };

        const created = await createOffer(createBody);
        notify.saved(t('products.offers.toast.offerCreated'));
        onSaved(created);
        onOpenChange(false);
      }
    } catch (err) {
      setError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <ModalHeader className="shrink-0 border-b border-border pb-4">
            <ModalTitle>
              {isEditing ? t('products.offers.form.editTitle') : t('products.offers.form.addTitle')}
            </ModalTitle>
            <ModalDescription>
              {isEditing
                ? `${offer?.sellerName} — ${offer?.skuCode}`
                : (product.title?.en ?? product.slug)}
            </ModalDescription>
          </ModalHeader>

          <ModalBody className="flex-1 overflow-y-auto space-y-4 py-4">
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            {/* Seller & Variant selection */}
            {!isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('products.offers.form.seller')}>
                  <select
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    disabled={submitting}
                    className={selectCls}
                  >
                    <option value="">{t('products.offers.form.selectSeller')}</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shop?.displayName ?? s.id} ({s.type === 'business' ? '3P' : 'Seller'})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t('products.offers.form.variant')}>
                  <select
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    disabled={submitting}
                    className={selectCls}
                  >
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.skuCode || 'Variant'} {v.status === 'inactive' ? '(inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <span>
                  Seller: <strong className="text-foreground">{offer?.sellerName}</strong>
                </span>
                <span>•</span>
                <span>
                  SKU: <strong className="font-mono text-foreground">{offer?.skuCode}</strong>
                </span>
              </div>
            )}

            {/* Pricing Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('products.offers.form.price', { currency })}>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={t('products.offers.form.pricePlaceholder')}
                    disabled={submitting}
                    className="pl-7 font-mono"
                  />
                </div>
              </Field>

              <Field label={t('products.offers.form.salePrice', { currency })}>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder={t('products.offers.form.salePricePlaceholder')}
                    disabled={submitting}
                    className="pl-7 font-mono"
                  />
                </div>
              </Field>
            </div>

            {/* Promotional Sale Window (optional) */}
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>{t('products.offers.form.saleDates')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('products.offers.form.saleStartsAt')}>
                  <Input
                    type="datetime-local"
                    value={saleStartsAt}
                    onChange={(e) => setSaleStartsAt(e.target.value)}
                    disabled={submitting}
                    className="text-xs"
                  />
                </Field>
                <Field label={t('products.offers.form.saleEndsAt')}>
                  <Input
                    type="datetime-local"
                    value={saleEndsAt}
                    onChange={(e) => setSaleEndsAt(e.target.value)}
                    disabled={submitting}
                    className="text-xs"
                  />
                </Field>
              </div>
            </div>

            {/* Condition & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label={t('products.offers.form.condition')}>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as OfferCondition)}
                  disabled={submitting}
                  className={selectCls}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {t(`products.offers.condition.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Field label={t('products.offers.form.conditionNotes')}>
                  <Input
                    value={conditionNotes}
                    onChange={(e) => setConditionNotes(e.target.value)}
                    placeholder={t('products.offers.form.conditionNotesPlaceholder')}
                    disabled={submitting}
                    maxLength={500}
                  />
                </Field>
              </div>
            </div>

            {/* Fulfillment & Quantities */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                label={t('products.offers.form.handlingDays')}
                hint={t('products.offers.form.handlingDaysHint')}
              >
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={handlingDays}
                  onChange={(e) => setHandlingDays(parseInt(e.target.value, 10) || 0)}
                  disabled={submitting}
                />
              </Field>

              <Field label={t('products.offers.form.minQty')}>
                <Input
                  type="number"
                  min={1}
                  value={minQty}
                  onChange={(e) => setMinQty(parseInt(e.target.value, 10) || 1)}
                  disabled={submitting}
                />
              </Field>

              <Field label={t('products.offers.form.maxQty')}>
                <Input
                  type="number"
                  min={1}
                  value={maxQty}
                  onChange={(e) => setMaxQty(e.target.value)}
                  placeholder="Unlimited"
                  disabled={submitting}
                />
              </Field>
            </div>

            {/* Initial Stock (create mode only) */}
            {!isEditing && (
              <div className="rounded-md border border-border/80 bg-card p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    <span>Initial Inventory Fulfillment</span>
                  </div>
                  {onNewWarehouseRequested && sellerId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onNewWarehouseRequested(sellerId)}
                      className="h-6 text-[11px] gap-1 px-1.5"
                    >
                      <Plus className="size-3" />
                      {t('products.offers.addWarehouse')}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label={t('products.offers.form.initialStock')}
                    hint={t('products.offers.form.initialStockHint')}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={initialStock}
                      onChange={(e) => setInitialStock(parseInt(e.target.value, 10) || 0)}
                      disabled={submitting}
                      className="font-mono"
                    />
                  </Field>

                  <Field label={t('products.offers.form.targetWarehouse')}>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      disabled={submitting || sellerWarehouses.length === 0}
                      className={selectCls}
                    >
                      {sellerWarehouses.length === 0 ? (
                        <option value="">No warehouses found</option>
                      ) : (
                        sellerWarehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} {wh.isDefault ? '(Default)' : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {/* Listing Status (edit mode) */}
            {isEditing && (
              <Field label={t('products.offers.form.status')}>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OfferStatus)}
                  disabled={submitting}
                  className={selectCls}
                >
                  <option value="active">Active (Available on storefront)</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            )}
          </ModalBody>

          <ModalFooter className="shrink-0 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('products.offers.form.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="size-4" />
                  <span>
                    {isEditing ? t('products.offers.form.save') : t('products.offers.form.create')}
                  </span>
                </>
              ) : (
                <span>
                  {isEditing ? t('products.offers.form.save') : t('products.offers.form.create')}
                </span>
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
