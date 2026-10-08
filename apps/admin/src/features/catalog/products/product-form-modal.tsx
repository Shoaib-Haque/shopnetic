'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { isReservedSlug, type Brand, type Category, type Product } from '@shopnetic/contracts';
import { Button, Field, Input, StatusBadge } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { slugify, slugifyLive } from '@/lib/slugify';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createProduct, updateProduct } from './api';

const selectCls =
  'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)] disabled:cursor-not-allowed disabled:opacity-50';

const textareaCls =
  'w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)] disabled:cursor-not-allowed disabled:opacity-50';

const formSchema = z.object({
  titleEn: z
    .string()
    .trim()
    .min(1, 'products.form.err.titleRequired')
    .max(200, 'products.form.err.titleLong'),
  slug: z
    .string()
    .trim()
    .max(80, 'products.form.err.slugLong')
    .refine((s) => s === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'products.form.err.slugFormat')
    .refine((s) => !isReservedSlug(s), 'products.form.err.slugFormat'),
  categoryId: z.string().uuid('products.form.err.categoryRequired'),
  brandId: z.string().uuid().or(z.literal('')).nullable(),
  descriptionEn: z.string().trim(),
  status: z.enum(['draft', 'pending', 'active', 'archived']),
  basePrice: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && parseFloat(v) >= 0),
      'products.form.err.priceInvalid',
    ),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{3}$/.test(v), 'products.form.err.currencyInvalid'),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  titleEn: '',
  slug: '',
  categoryId: '',
  brandId: '',
  descriptionEn: '',
  status: 'draft',
  basePrice: '',
  currency: 'USD',
};

const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  PRODUCT_SLUG_TAKEN: 'slug',
  PRODUCT_CATEGORY_INVALID: 'categoryId',
  PRODUCT_BRAND_INVALID: 'brandId',
};

const collapseWs = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function ProductFormModal({
  open,
  onOpenChange,
  mode,
  product,
  categories,
  brands,
  onSaved,
  onDelete,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit' | 'review' | 'view';
  product?: Product | undefined;
  categories: Category[];
  brands: Brand[];
  onSaved: (action: 'created' | 'updated', p: Product) => void;
  onDelete?: (p: Product) => void;
  onConflict?: () => void;
}) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'save' | 'approve' | 'reject' | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setSlugTouched(false);
    setSubmittingAction(null);

    if (product) {
      reset({
        titleEn: product.title?.en ?? '',
        slug: product.slug ?? '',
        categoryId: product.categoryId ?? '',
        brandId: product.brandId ?? '',
        descriptionEn: product.description?.en ?? '',
        status: product.status,
        basePrice: product.basePriceMinor ? (Number(product.basePriceMinor) / 100).toFixed(2) : '',
        currency: product.currency ?? 'USD',
      });
    } else {
      reset({
        ...EMPTY,
        categoryId: categories[0]?.id ?? '',
      });
    }
  }, [open, product, categories, reset]);

  function fieldError(field: Path<FormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  async function submitWithStatus(
    targetStatus: Product['status'],
    values: FormValues,
  ): Promise<void> {
    setFormError(null);
    try {
      if (mode === 'create') {
        const slug = values.slug ? values.slug : slugify(values.titleEn);
        const basePriceMinor = values.basePrice
          ? Math.round(parseFloat(values.basePrice) * 100)
          : null;
        const p = await createProduct({
          categoryId: values.categoryId,
          brandId: values.brandId ? values.brandId : null,
          title: { en: values.titleEn },
          slug,
          description: values.descriptionEn ? { en: values.descriptionEn } : undefined,
          status: targetStatus,
          basePriceMinor,
          currency: values.currency || (values.basePrice ? 'USD' : null),
          proposedBySellerId: null,
        });
        onOpenChange(false);
        onSaved('created', p);
      } else if (product) {
        const basePriceMinor = values.basePrice
          ? Math.round(parseFloat(values.basePrice) * 100)
          : null;
        const p = await updateProduct(product.id, {
          brandId: values.brandId ? values.brandId : null,
          title: { en: values.titleEn },
          slug: values.slug,
          description: values.descriptionEn ? { en: values.descriptionEn } : null,
          status: targetStatus,
          basePriceMinor,
          currency: values.currency || (values.basePrice ? 'USD' : null),
          expectedUpdatedAt: product.updatedAt,
        });
        onOpenChange(false);
        onSaved('updated', p);
      }
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'CONFLICT') {
        onConflict?.();
        return;
      }
      if (e instanceof AdminApiError && e.code && FIELD_FOR_CODE[e.code]) {
        setError(FIELD_FOR_CODE[e.code]!, {
          type: 'server',
          message: t(catalogErrorKey(e.code)),
        });
        return;
      }
      setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    }
  }

  async function onSubmit(values: FormValues): Promise<void> {
    const status = mode === 'review' ? 'active' : values.status;
    setSubmittingAction(mode === 'review' ? 'approve' : 'save');
    try {
      await submitWithStatus(status, values);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleReject(): Promise<void> {
    if (isSubmitting || submittingAction) return;
    const valid = await trigger();
    if (!valid) return;
    const values = getValues();
    setSubmittingAction('reject');
    try {
      await submitWithStatus('draft', values);
    } finally {
      setSubmittingAction(null);
    }
  }

  const titleField = register('titleEn');
  const slugField = register('slug');
  const descField = register('descriptionEn');
  const priceField = register('basePrice');
  const currencyField = register('currency');

  const selectedCat = categories.find(
    (c) => c.id === (product?.categoryId ?? getValues('categoryId')),
  );
  const catName = selectedCat ? selectedCat.name.en || selectedCat.slug : product?.categoryId;

  const isReadOnly = mode === 'view';

  const secondaryAction: ReactNode =
    mode === 'review' ? (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isSubmitting || submittingAction !== null}
        loading={submittingAction === 'reject'}
        onClick={() => void handleReject()}
      >
        {t('products.form.reject')}
      </Button>
    ) : mode === 'edit' && product && onDelete ? (
      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          onDelete(product);
        }}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        {t('products.delete')}
      </button>
    ) : undefined;

  let modalTitle = t('products.form.createTitle');
  if (mode === 'edit') modalTitle = t('products.form.editTitle');
  if (mode === 'review') modalTitle = t('products.form.reviewTitle');
  if (mode === 'view') modalTitle = t('products.form.viewTitle');

  const submitLabel =
    mode === 'review'
      ? t('products.form.approve')
      : mode === 'create'
        ? t('products.form.create')
        : t('products.form.save');

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={modalTitle}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting || submittingAction !== null}
      submitLabel={submitLabel}
      readOnly={isReadOnly}
      dirty={isDirty}
      size="lg"
      {...(secondaryAction ? { secondaryAction } : {})}
    >
      {formError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      {/* Origin & vendor notification for 3P proposals or edit mode */}
      {product?.proposedBySellerId ? (
        <div className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          <div className="flex items-center gap-2">
            <StatusBadge tone="warning">{t('products.originBadges.threeP')}</StatusBadge>
            <span>{t('products.form.vendorInfo', { sellerId: product.proposedBySellerId })}</span>
          </div>
          {mode === 'review' && (
            <span className="font-semibold text-warning-foreground uppercase tracking-wider text-[10px]">
              {t('products.status.pending')}
            </span>
          )}
        </div>
      ) : product ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone="neutral">{t('products.originBadges.oneP')}</StatusBadge>
          <span>{t('products.form.inHouseInfo')}</span>
        </div>
      ) : null}

      {/* Category selection (locked on edit/review/view) */}
      {mode === 'create' ? (
        <Field
          label={t('products.form.category')}
          htmlFor="product-category"
          error={fieldError('categoryId')}
        >
          <select
            id="product-category"
            className={selectCls}
            {...register('categoryId')}
            disabled={isReadOnly}
          >
            <option value="" disabled>
              {t('products.form.selectCategory')}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.en || c.slug}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">
            {t('products.form.category')}
          </label>
          <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground">
            {catName}
          </div>
          <span className="text-xs text-muted-foreground">
            {t('products.form.categoryLockedHint')}
          </span>
        </div>
      )}

      {/* Brand selection */}
      <Field label={t('products.form.brand')} htmlFor="product-brand" error={fieldError('brandId')}>
        <select
          id="product-brand"
          className={selectCls}
          {...register('brandId')}
          disabled={isReadOnly}
        >
          <option value="">{t('products.form.noBrand')}</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Title */}
      <Field label={t('products.form.title')} htmlFor="product-title" error={fieldError('titleEn')}>
        <Input
          id="product-title"
          maxLength={200}
          placeholder={t('products.form.titlePlaceholder')}
          invalid={Boolean(errors.titleEn)}
          disabled={isReadOnly}
          {...titleField}
          onChange={(e) => {
            void titleField.onChange(e);
            if (mode === 'create' && !slugTouched) {
              setValue('slug', slugifyLive(e.target.value));
            }
          }}
          onBlur={(e) => {
            e.currentTarget.value = collapseWs(e.currentTarget.value);
            void titleField.onChange(e);
            void titleField.onBlur(e);
            if (mode === 'create' && !slugTouched) {
              setValue('slug', slugify(e.currentTarget.value));
            }
          }}
        />
      </Field>

      {/* Slug */}
      <Field
        label={t('products.form.slug')}
        htmlFor="product-slug"
        hint={mode === 'create' && !slugTouched ? t('products.form.slugAutoHint') : undefined}
        error={fieldError('slug')}
      >
        <Input
          id="product-slug"
          maxLength={80}
          placeholder={t('products.form.slugPlaceholder')}
          invalid={Boolean(errors.slug)}
          disabled={isReadOnly}
          {...slugField}
          onChange={(e) => {
            e.currentTarget.value = slugifyLive(e.currentTarget.value);
            void slugField.onChange(e);
            setSlugTouched(true);
          }}
          onBlur={(e) => {
            e.currentTarget.value = slugify(e.currentTarget.value);
            void slugField.onChange(e);
            void slugField.onBlur(e);
          }}
        />
      </Field>

      {/* Description */}
      <Field
        label={t('products.form.description')}
        htmlFor="product-description"
        error={fieldError('descriptionEn')}
      >
        <textarea
          id="product-description"
          className={textareaCls}
          placeholder={t('products.form.descriptionPlaceholder')}
          disabled={isReadOnly}
          {...descField}
          onBlur={(e) => {
            e.currentTarget.value = collapseWs(e.currentTarget.value);
            void descField.onChange(e);
            void descField.onBlur(e);
          }}
        />
      </Field>

      {/* Base Price and Currency */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t('products.form.basePrice')}
          htmlFor="product-price"
          error={fieldError('basePrice')}
        >
          <Input
            id="product-price"
            placeholder={t('products.form.basePricePlaceholder')}
            invalid={Boolean(errors.basePrice)}
            disabled={isReadOnly}
            {...priceField}
          />
        </Field>
        <Field
          label={t('products.form.currency')}
          htmlFor="product-currency"
          error={fieldError('currency')}
        >
          <Input
            id="product-currency"
            maxLength={3}
            invalid={Boolean(errors.currency)}
            disabled={isReadOnly}
            {...currencyField}
            onBlur={(e) => {
              e.currentTarget.value = e.currentTarget.value.trim().toUpperCase();
              void currencyField.onChange(e);
              void currencyField.onBlur(e);
            }}
          />
        </Field>
      </div>

      {/* Status (when not review or create) */}
      {mode === 'edit' && (
        <Field
          label={t('products.form.status')}
          htmlFor="product-status"
          error={fieldError('status')}
        >
          <select
            id="product-status"
            className={selectCls}
            {...register('status')}
            disabled={isReadOnly}
          >
            <option value="draft">{t('products.status.draft')}</option>
            <option value="pending">{t('products.status.pending')}</option>
            <option value="active">{t('products.status.active')}</option>
          </select>
        </Field>
      )}
    </FormModal>
  );
}
