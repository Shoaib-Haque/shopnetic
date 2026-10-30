'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, Sparkles } from 'lucide-react';
import {
  type CreateOfferRequest,
  type Offer,
  type OfferCondition,
  type Product,
  type SellerWithShop,
  type UpdateOfferRequest,
  type Variant,
  type Warehouse,
  currencySchema,
  decimalToMinor,
  minorToDecimal,
  getCurrencyExponent,
  normalizeCurrency,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  notify,
} from '@shopnetic/ui';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import {
  SUPPORTED_CURRENCIES,
  decimalKeyDownHandler,
  decimalPasteHandler,
  integerKeyDownHandler,
  integerPasteHandler,
  sanitizeDecimalString,
} from '@/lib/numeric-input';
import { createOffer, updateOffer } from './api';
import { SellerCombobox } from './seller-combobox';

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
  onConflict?: () => void;
}

const CONDITIONS: OfferCondition[] = [
  'new',
  'refurbished_like_new',
  'refurbished_good',
  'used_like_new',
  'used_good',
  'used_fair',
];

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const offerFormSchema = z
  .object({
    sellerId: z.string().trim().min(1, 'products.offers.form.err.sellerRequired'),
    variantId: z.string().trim().min(1, 'products.offers.form.err.variantRequired'),
    price: z.string().trim().min(1, 'products.offers.form.err.priceRequired'),
    currency: currencySchema,
    salePrice: z.string().trim().optional().or(z.literal('')),
    saleStartsAt: z.string().trim().optional().or(z.literal('')),
    saleEndsAt: z.string().trim().optional().or(z.literal('')),
    condition: z.enum([
      'new',
      'refurbished_like_new',
      'refurbished_good',
      'used_like_new',
      'used_good',
      'used_fair',
    ]),
    conditionNotes: z.string().trim().max(500).optional().or(z.literal('')),
    handlingDays: z
      .string()
      .trim()
      .refine(
        (v) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 30,
        'products.offers.form.err.handlingDaysInvalid',
      ),
    minQty: z
      .string()
      .trim()
      .refine(
        (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 999999,
        'products.offers.form.err.minQtyInvalid',
      ),
    maxQty: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+$/.test(v), 'products.offers.form.err.maxQtyInvalid')
      .refine((v) => v === '' || Number(v) >= 1, 'products.offers.form.err.maxQtyMin')
      .refine((v) => v === '' || Number(v) <= 999999, 'products.offers.form.err.maxQtyMax')
      .optional()
      .or(z.literal('')),
    initialStock: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 999999),
        'products.offers.form.err.initialStockInvalid',
      )
      .optional()
      .or(z.literal('')),
    warehouseId: z.string().trim().optional().or(z.literal('')),
    status: z.enum(['active', 'paused', 'out_of_stock', 'under_review', 'suppressed']),
  })
  .superRefine((data, ctx) => {
    const cur = data.currency;
    const exponent = getCurrencyExponent(cur);

    // Validate price
    const priceMinor = decimalToMinor(data.price, cur);
    if (!priceMinor || BigInt(priceMinor) <= 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'products.offers.form.err.priceRequired',
        path: ['price'],
      });
    }

    if (exponent === 0 && data.price.includes('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'products.offers.form.err.priceRequired',
        path: ['price'],
      });
    }

    // 1. Sale price must be strictly less than list price
    if (data.salePrice && data.salePrice.trim() !== '') {
      if (exponent === 0 && data.salePrice.includes('.')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'products.offers.form.err.priceRequired',
          path: ['salePrice'],
        });
      }
      const salePriceMinor = decimalToMinor(data.salePrice, cur);
      if (salePriceMinor && priceMinor && BigInt(salePriceMinor) >= BigInt(priceMinor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'products.offers.form.err.salePriceGtePrice',
          path: ['salePrice'],
        });
      }
    }
    // 2. Sale end must be after sale start
    if (data.saleStartsAt && data.saleEndsAt) {
      if (new Date(data.saleEndsAt) <= new Date(data.saleStartsAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'products.offers.form.err.saleEndBeforeStart',
          path: ['saleEndsAt'],
        });
      }
    }
    // 3. Max qty cannot be less than min qty
    if (data.maxQty && data.maxQty.trim() !== '') {
      const min = Number(data.minQty);
      const max = Number(data.maxQty);
      if (!isNaN(min) && !isNaN(max) && max < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'products.offers.form.err.maxLessThanMin',
          path: ['maxQty'],
        });
      }
    }
    // 4. If initialStock > 0, warehouse is required
    if (data.initialStock && Number(data.initialStock) > 0 && !data.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'products.offers.form.err.warehouseRequired',
        path: ['warehouseId'],
      });
    }
  });

type OfferFormValues = z.infer<typeof offerFormSchema>;

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
  onConflict,
}: OfferFormModalProps) {
  const t = useTranslations('catalog');
  const tAdmin = useTranslations('admin');
  const isEditing = Boolean(offer);

  const defaultSeller = useMemo(() => {
    return sellers.find((s) => s.shop?.slug === 'shopnetic-retail') ?? sellers[0];
  }, [sellers]);

  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const hadConflictRef = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: {
      sellerId: '',
      variantId: '',
      price: '',
      currency: 'USD',
      salePrice: '',
      saleStartsAt: '',
      saleEndsAt: '',
      condition: 'new',
      conditionNotes: '',
      handlingDays: '1',
      minQty: '1',
      maxQty: '',
      initialStock: '10',
      warehouseId: '',
      status: 'active',
    },
  });

  const selectedSellerId = watch('sellerId');
  const activeSellerId = isEditing && offer ? offer.sellerId : selectedSellerId;
  const currentCurrency = watch('currency') || 'USD';
  const currencyExponent = getCurrencyExponent(currentCurrency);
  const currencySymbol =
    SUPPORTED_CURRENCIES.find((c) => c.code === currentCurrency)?.symbol ?? '$';
  const currencyPaddingClass = useMemo(() => {
    const len = currencySymbol.length;
    if (len >= 3) return 'pl-12';
    if (len === 2) return 'pl-9';
    return 'pl-7';
  }, [currencySymbol]);

  function fieldError(field: Path<OfferFormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  // Filter warehouses for chosen seller
  const sellerWarehouses = useMemo(() => {
    return warehouses.filter((w) => w.sellerId === activeSellerId);
  }, [warehouses, activeSellerId]);

  // Sync state when opening modal
  useEffect(() => {
    if (!open) return;
    setServerError(null);

    if (offer) {
      reset({
        sellerId: offer.sellerId,
        variantId: offer.variantId,
        price: minorToDecimal(offer.priceMinor, offer.currency),
        currency: offer.currency,
        salePrice: minorToDecimal(offer.salePriceMinor, offer.currency),
        saleStartsAt: toLocalDatetimeInput(offer.saleStartsAt),
        saleEndsAt: toLocalDatetimeInput(offer.saleEndsAt),
        condition: offer.condition,
        conditionNotes: offer.conditionNotes ?? '',
        handlingDays: String(offer.handlingDays),
        minQty: String(offer.minQty),
        maxQty: offer.maxQty != null ? String(offer.maxQty) : '',
        initialStock: '0',
        warehouseId: '',
        status: offer.status,
      });
    } else {
      const initialSellerId = defaultSeller ? defaultSeller.id : '';
      const initialVariantId = selectedVariantId ?? (variants[0] ? variants[0].id : '');
      const defaultWh = warehouses.find((w) => w.sellerId === initialSellerId && w.isDefault);
      const fallbackWh = warehouses.find((w) => w.sellerId === initialSellerId);

      reset({
        sellerId: initialSellerId,
        variantId: initialVariantId,
        price: '',
        currency: normalizeCurrency(product.currency, 'USD'),
        salePrice: '',
        saleStartsAt: '',
        saleEndsAt: '',
        condition: 'new',
        conditionNotes: '',
        handlingDays: '1',
        minQty: '1',
        maxQty: '',
        initialStock: '10',
        warehouseId: defaultWh ? defaultWh.id : fallbackWh ? fallbackWh.id : '',
        status: 'active',
      });
    }
  }, [open, offer, defaultSeller, selectedVariantId, variants, product, warehouses, reset]);

  // Auto-sanitize decimal places when currency changes
  useEffect(() => {
    const p = getValues('price');
    if (p) {
      const sanitizedP = sanitizeDecimalString(p, currencyExponent);
      if (sanitizedP !== p) {
        setValue('price', sanitizedP, { shouldValidate: true });
      }
    }
    const sp = getValues('salePrice');
    if (sp) {
      const sanitizedSp = sanitizeDecimalString(sp, currencyExponent);
      if (sanitizedSp !== sp) {
        setValue('salePrice', sanitizedSp, { shouldValidate: true });
      }
    }
  }, [currentCurrency, currencyExponent, getValues, setValue]);

  // Auto-select default warehouse when seller changes
  const currentWarehouseId = watch('warehouseId');
  useEffect(() => {
    if (!open || isEditing) return;
    if (sellerWarehouses.length > 0) {
      const exists = sellerWarehouses.some((w) => w.id === currentWarehouseId);
      if (!exists) {
        const def = sellerWarehouses.find((w) => w.isDefault) ?? sellerWarehouses[0];
        setValue('warehouseId', def ? def.id : '', { shouldValidate: true });
      }
    } else {
      if (currentWarehouseId) {
        setValue('warehouseId', '', { shouldValidate: true });
      }
    }
  }, [open, isEditing, sellerWarehouses, currentWarehouseId, setValue]);

  const handleAttemptClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    if (hadConflictRef.current) {
      hadConflictRef.current = false;
      onConflict?.();
    }
    onOpenChange(false);
  };

  const onValidSubmit = async (data: OfferFormValues) => {
    setServerError(null);

    if (isEditing && offer && !isDirty) {
      if (hadConflictRef.current) {
        hadConflictRef.current = false;
        onConflict?.();
      }
      onOpenChange(false);
      return;
    }

    const priceMinor = decimalToMinor(data.price, data.currency);
    if (!priceMinor || BigInt(priceMinor) <= 0n) {
      setServerError(t('products.offers.form.err.priceRequired'));
      return;
    }

    const salePriceMinor = data.salePrice ? decimalToMinor(data.salePrice, data.currency) : null;

    try {
      if (isEditing && offer) {
        const updateBody: UpdateOfferRequest = {
          priceMinor,
          currency: data.currency,
          salePriceMinor,
          saleStartsAt: data.saleStartsAt ? new Date(data.saleStartsAt).toISOString() : null,
          saleEndsAt: data.saleEndsAt ? new Date(data.saleEndsAt).toISOString() : null,
          condition: data.condition,
          conditionNotes: data.conditionNotes?.trim() || null,
          handlingDays: Number(data.handlingDays),
          status: data.status,
          minQty: Number(data.minQty),
          maxQty: data.maxQty?.trim() ? parseInt(data.maxQty, 10) : null,
          expectedUpdatedAt: offer.updatedAt,
        };

        const updated = await updateOffer(offer.id, updateBody);
        notify.saved(t('products.offers.toast.offerUpdated'));
        onSaved(updated);
        onOpenChange(false);
      } else {
        const createBody: CreateOfferRequest = {
          sellerId: data.sellerId,
          variantId: data.variantId,
          priceMinor,
          currency: data.currency,
          salePriceMinor: salePriceMinor ?? undefined,
          saleStartsAt: data.saleStartsAt ? new Date(data.saleStartsAt).toISOString() : undefined,
          saleEndsAt: data.saleEndsAt ? new Date(data.saleEndsAt).toISOString() : undefined,
          condition: data.condition,
          conditionNotes: data.conditionNotes?.trim() || undefined,
          handlingDays: Number(data.handlingDays),
          minQty: Number(data.minQty),
          maxQty: data.maxQty?.trim() ? parseInt(data.maxQty, 10) : undefined,
          initialStock: data.initialStock ? Math.max(0, parseInt(data.initialStock, 10)) : 0,
          warehouseId: data.warehouseId || undefined,
        };

        const created = await createOffer(createBody);
        notify.saved(t('products.offers.toast.offerCreated'));
        onSaved(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        hadConflictRef.current = true;
      }
      setServerError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next) handleAttemptClose();
          else onOpenChange(true);
        }}
      >
        <ModalContent className="max-w-xl max-h-[85vh] flex flex-col p-0">
          <form
            noValidate
            onSubmit={handleSubmit(onValidSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <ModalHeader className="shrink-0 border-b border-border pb-4">
              <ModalTitle>
                {isEditing
                  ? t('products.offers.form.editTitle')
                  : t('products.offers.form.addTitle')}
              </ModalTitle>
              <ModalDescription>
                {isEditing
                  ? `${offer?.sellerName} — ${offer?.skuCode}`
                  : (product.title?.en ?? product.slug)}
              </ModalDescription>
            </ModalHeader>

            <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
              {serverError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                  {serverError}
                </div>
              )}

              {/* Seller & Variant selection */}
              {!isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label={t('products.offers.form.seller')}
                    htmlFor="offer-seller"
                    error={fieldError('sellerId')}
                  >
                    <Controller
                      control={control}
                      name="sellerId"
                      render={({ field }) => (
                        <SellerCombobox
                          id="offer-seller"
                          value={field.value}
                          onChange={field.onChange}
                          sellers={sellers}
                          disabled={isSubmitting}
                          invalid={Boolean(errors.sellerId)}
                          placeholder={t('products.offers.form.selectSeller')}
                          ariaLabel="Seller"
                        />
                      )}
                    />
                  </Field>

                  <Field
                    label={t('products.offers.form.variant')}
                    htmlFor="offer-variant"
                    error={fieldError('variantId')}
                  >
                    <Controller
                      control={control}
                      name="variantId"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger id="offer-variant" invalid={Boolean(errors.variantId)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {variants.map((v) => {
                              const label = `${v.skuCode || 'Variant'} ${v.status === 'inactive' ? '(inactive)' : ''}`;
                              return (
                                <SelectItem key={v.id} value={v.id} title={label}>
                                  {label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    />
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

              {/* Pricing & Currency Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Field
                    label={t('products.offers.form.price', { currency: currentCurrency })}
                    error={fieldError('price')}
                  >
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">
                        {currencySymbol}
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        {...register('price')}
                        placeholder={t('products.offers.form.pricePlaceholder')}
                        disabled={isSubmitting}
                        className={`${currencyPaddingClass} font-mono`}
                        invalid={Boolean(errors.price)}
                        onKeyDown={(e) => decimalKeyDownHandler(e, currencyExponent)}
                        onPaste={(e) =>
                          decimalPasteHandler(
                            e,
                            (val) =>
                              setValue('price', val, { shouldValidate: true, shouldDirty: true }),
                            currencyExponent,
                          )
                        }
                      />
                    </div>
                  </Field>
                </div>

                <div>
                  <Field label={t('products.form.currency')} error={fieldError('currency')}>
                    <Controller
                      control={control}
                      name="currency"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger id="offer-currency" invalid={Boolean(errors.currency)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_CURRENCIES.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={t('products.offers.form.salePrice', { currency: currentCurrency })}
                  error={fieldError('salePrice')}
                >
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      {...register('salePrice')}
                      placeholder={t('products.offers.form.salePricePlaceholder')}
                      disabled={isSubmitting}
                      className={`${currencyPaddingClass} font-mono`}
                      invalid={Boolean(errors.salePrice)}
                      onKeyDown={(e) => decimalKeyDownHandler(e, currencyExponent)}
                      onPaste={(e) =>
                        decimalPasteHandler(
                          e,
                          (val) =>
                            setValue('salePrice', val, { shouldValidate: true, shouldDirty: true }),
                          currencyExponent,
                        )
                      }
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
                  <Field
                    label={t('products.offers.form.saleStartsAt')}
                    htmlFor="offer-sale-starts-at"
                    error={fieldError('saleStartsAt')}
                  >
                    <Input
                      id="offer-sale-starts-at"
                      type="datetime-local"
                      {...register('saleStartsAt')}
                      disabled={isSubmitting}
                      className="text-xs"
                      invalid={Boolean(errors.saleStartsAt)}
                    />
                  </Field>
                  <Field
                    label={t('products.offers.form.saleEndsAt')}
                    htmlFor="offer-sale-ends-at"
                    error={fieldError('saleEndsAt')}
                  >
                    <Input
                      id="offer-sale-ends-at"
                      type="datetime-local"
                      {...register('saleEndsAt')}
                      disabled={isSubmitting}
                      className="text-xs"
                      invalid={Boolean(errors.saleEndsAt)}
                    />
                  </Field>
                </div>
              </div>

              {/* Condition & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field
                  label={t('products.offers.form.condition')}
                  htmlFor="offer-condition"
                  error={fieldError('condition')}
                >
                  <Controller
                    control={control}
                    name="condition"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="offer-condition" invalid={Boolean(errors.condition)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITIONS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {t(`products.offers.condition.${c}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Field
                    label={t('products.offers.form.conditionNotes')}
                    error={fieldError('conditionNotes')}
                  >
                    <Input
                      {...register('conditionNotes')}
                      placeholder={t('products.offers.form.conditionNotesPlaceholder')}
                      disabled={isSubmitting}
                      maxLength={500}
                      invalid={Boolean(errors.conditionNotes)}
                    />
                  </Field>
                </div>
              </div>

              {/* Fulfillment & Quantities */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field
                  label={t('products.offers.form.handlingDays')}
                  htmlFor="offer-handling-days"
                  hint={t('products.offers.form.handlingDaysHint')}
                  error={fieldError('handlingDays')}
                >
                  <Input
                    id="offer-handling-days"
                    type="number"
                    {...register('handlingDays')}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.handlingDays)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('handlingDays', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
                  />
                </Field>

                <Field
                  label={t('products.offers.form.minQty')}
                  htmlFor="offer-min-qty"
                  error={fieldError('minQty')}
                >
                  <Input
                    id="offer-min-qty"
                    type="number"
                    {...register('minQty')}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.minQty)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('minQty', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
                  />
                </Field>

                <Field
                  label={t('products.offers.form.maxQty')}
                  htmlFor="offer-max-qty"
                  error={fieldError('maxQty')}
                >
                  <Input
                    id="offer-max-qty"
                    type="number"
                    {...register('maxQty')}
                    placeholder="Unlimited"
                    disabled={isSubmitting}
                    invalid={Boolean(errors.maxQty)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('maxQty', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
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
                    {onNewWarehouseRequested && selectedSellerId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onNewWarehouseRequested(selectedSellerId)}
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
                      htmlFor="offer-initial-stock"
                      hint={t('products.offers.form.initialStockHint')}
                      error={fieldError('initialStock')}
                    >
                      <Input
                        id="offer-initial-stock"
                        type="number"
                        {...register('initialStock')}
                        disabled={isSubmitting}
                        className="font-mono"
                        invalid={Boolean(errors.initialStock)}
                        onKeyDown={integerKeyDownHandler}
                        onPaste={(e) =>
                          integerPasteHandler(e, (val) =>
                            setValue('initialStock', val, {
                              shouldValidate: true,
                              shouldDirty: true,
                            }),
                          )
                        }
                      />
                    </Field>

                    <Field
                      label={t('products.offers.form.targetWarehouse')}
                      htmlFor="offer-target-warehouse"
                      error={fieldError('warehouseId')}
                    >
                      <Controller
                        control={control}
                        name="warehouseId"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isSubmitting || sellerWarehouses.length === 0}
                          >
                            <SelectTrigger
                              id="offer-target-warehouse"
                              invalid={Boolean(errors.warehouseId)}
                            >
                              <SelectValue
                                placeholder={
                                  sellerWarehouses.length === 0
                                    ? t('products.offers.form.noWarehouses')
                                    : t('products.offers.form.selectWarehouse')
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {sellerWarehouses.map((wh) => {
                                const label = `${wh.name} ${wh.isDefault ? '(Default)' : ''}`;
                                return (
                                  <SelectItem key={wh.id} value={wh.id} title={label}>
                                    {label}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* Listing Status (edit mode) */}
              {isEditing && (
                <Field
                  label={t('products.offers.form.status')}
                  htmlFor="offer-status"
                  error={fieldError('status')}
                >
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="offer-status" invalid={Boolean(errors.status)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active (Available on storefront)</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                          <SelectItem value="under_review">Under Review</SelectItem>
                          <SelectItem value="suppressed">Suppressed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              )}
            </ModalBody>

            <ModalFooter className="shrink-0 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={handleAttemptClose}
              >
                {t('products.offers.form.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                {isEditing ? t('products.offers.form.save') : t('products.offers.form.create')}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={tAdmin('form.discardTitle')}
        message={tAdmin('form.discardMessage')}
        confirmLabel={tAdmin('form.discardConfirm')}
        cancelLabel={tAdmin('actions.cancel')}
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          reset();
          if (hadConflictRef.current) {
            hadConflictRef.current = false;
            onConflict?.();
          }
          onOpenChange(false);
        }}
      />
    </>
  );
}
