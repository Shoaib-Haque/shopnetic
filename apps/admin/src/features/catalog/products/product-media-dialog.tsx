'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Film,
  Image as ImageIcon,
  Play,
  Plus,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  deriveProductCoverMedia,
  deriveVariantLeadMediaMap,
  type CreateMediaRequest,
  type MediaAsset,
  type OptionType,
  type Product,
  type ProductOption,
  type UpdateMediaRequest,
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
  notify,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  StatusBadge,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { integerKeyDownHandler, integerPasteHandler } from '@/lib/numeric-input';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import {
  createProductMedia,
  deleteMedia,
  deleteMediaTag,
  listProductMedia,
  listProductOptions,
  putMediaTag,
  reorderProductMedia,
  updateMedia,
} from './api';

// ── Sub-modal: Media Form Modal (Add / Edit) ──────────────────────────────────

interface MediaFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  asset: MediaAsset | null;
  onSaved: (asset: MediaAsset) => void;
}

const mediaFormSchema = z
  .object({
    kind: z.enum(['image', 'video']),
    fileKey: z.string().trim().min(1, 'products.media.form.err.fileKeyRequired'),
    posterKey: z.string().trim().optional().or(z.literal('')),
    alt: z.string().trim().optional().or(z.literal('')),
    durationS: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 86400),
        'products.media.form.err.durationInvalid',
      )
      .optional()
      .or(z.literal('')),
    status: z.enum(['active', 'pending', 'rejected']),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'video' && (!data.posterKey || !data.posterKey.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'products.media.form.err.posterKeyRequired',
        path: ['posterKey'],
      });
    }
  });

type MediaFormValues = z.infer<typeof mediaFormSchema>;

function MediaFormModal({ open, onOpenChange, productId, asset, onSaved }: MediaFormModalProps) {
  const t = useTranslations('catalog');
  const isEdit = asset !== null;

  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MediaFormValues>({
    resolver: zodResolver(mediaFormSchema),
    defaultValues: {
      kind: 'image',
      fileKey: '',
      posterKey: '',
      alt: '',
      durationS: '',
      status: 'active',
    },
  });

  const selectedKind = watch('kind');

  function fieldError(field: Path<MediaFormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  useEffect(() => {
    if (!open) {
      reset({
        kind: 'image',
        fileKey: '',
        posterKey: '',
        alt: '',
        durationS: '',
        status: 'active',
      });
      setFormError(null);
      return;
    }

    if (asset) {
      reset({
        kind: asset.kind,
        fileKey: asset.fileKey,
        posterKey: asset.posterKey ?? '',
        alt: asset.alt?.en ?? '',
        durationS: asset.durationS != null ? String(asset.durationS) : '',
        status: asset.status,
      });
    } else {
      reset({
        kind: 'image',
        fileKey: '',
        posterKey: '',
        alt: '',
        durationS: '',
        status: 'active',
      });
    }
    setFormError(null);
  }, [open, asset, reset]);

  const onValidSubmit = async (data: MediaFormValues) => {
    setFormError(null);

    const cleanFileKey = data.fileKey.trim();
    const cleanPosterKey = data.posterKey?.trim() || '';

    try {
      if (isEdit && asset) {
        const req: UpdateMediaRequest = {
          fileKey: cleanFileKey,
          posterKey: cleanPosterKey || null,
          alt: data.alt?.trim() ? { en: data.alt.trim() } : null,
          durationS: data.durationS ? Number(data.durationS) : null,
          status: data.status,
          expectedUpdatedAt: asset.updatedAt,
        };
        const updated = await updateMedia(asset.id, req);
        onSaved(updated);
        notify.saved(t('products.media.toast.updated'));
        onOpenChange(false);
      } else {
        const req: CreateMediaRequest = {
          kind: data.kind,
          fileKey: cleanFileKey,
          posterKey: cleanPosterKey || null,
          alt: data.alt?.trim() ? { en: data.alt.trim() } : undefined,
          durationS: data.durationS ? Number(data.durationS) : undefined,
          status: data.status,
        };
        const created = await createProductMedia(productId, req);
        onSaved(created);
        notify.saved(t('products.media.toast.added'));
        onOpenChange(false);
      }
    } catch (err) {
      setFormError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md max-h-[85vh] flex flex-col">
        <form onSubmit={handleSubmit(onValidSubmit)} className="flex min-h-0 flex-1 flex-col">
          <ModalHeader className="shrink-0 border-b border-border pb-4">
            <ModalTitle>
              {isEdit ? t('products.media.form.editTitle') : t('products.media.form.addTitle')}
            </ModalTitle>
            <ModalDescription>{t('products.media.dialogSubtitle')}</ModalDescription>
          </ModalHeader>

          <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
            {/* Kind Selector */}
            {!isEdit && (
              <Field label={t('products.media.form.kind')} htmlFor="media-kind">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={selectedKind === 'image' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setValue('kind', 'image', { shouldValidate: true })}
                    className="flex-1 gap-1.5"
                  >
                    <ImageIcon className="size-4" />
                    {t('products.media.kindImage')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedKind === 'video' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setValue('kind', 'video', { shouldValidate: true })}
                    className="flex-1 gap-1.5"
                  >
                    <Film className="size-4" />
                    {t('products.media.kindVideo')}
                  </Button>
                </div>
              </Field>
            )}

            {/* File Key / URL */}
            <Field
              label={t('products.media.form.fileKey')}
              htmlFor="media-file-key"
              error={fieldError('fileKey')}
            >
              <Input
                id="media-file-key"
                {...register('fileKey')}
                placeholder={t('products.media.form.fileKeyPlaceholder')}
                invalid={Boolean(errors.fileKey)}
              />
            </Field>

            {/* Poster Key (Videos only) */}
            {selectedKind === 'video' && (
              <Field
                label={t('products.media.form.posterKey')}
                htmlFor="media-poster-key"
                hint={t('products.media.form.posterKeyHint')}
                error={fieldError('posterKey')}
              >
                <Input
                  id="media-poster-key"
                  {...register('posterKey')}
                  placeholder={t('products.media.form.posterKeyPlaceholder')}
                  invalid={Boolean(errors.posterKey)}
                />
              </Field>
            )}

            {/* Alt Text */}
            <Field
              label={t('products.media.form.alt')}
              htmlFor="media-alt"
              error={fieldError('alt')}
            >
              <Input
                id="media-alt"
                {...register('alt')}
                placeholder={t('products.media.form.altPlaceholder')}
                invalid={Boolean(errors.alt)}
              />
            </Field>

            {/* Duration (Videos only) */}
            {selectedKind === 'video' && (
              <Field
                label={t('products.media.form.durationS')}
                htmlFor="media-duration"
                error={fieldError('durationS')}
              >
                <Input
                  id="media-duration"
                  type="number"
                  min="1"
                  max="86400"
                  {...register('durationS')}
                  placeholder={t('products.media.form.durationPlaceholder')}
                  invalid={Boolean(errors.durationS)}
                  onKeyDown={integerKeyDownHandler}
                  onPaste={(e) =>
                    integerPasteHandler(e, (val) =>
                      setValue('durationS', val, { shouldValidate: true, shouldDirty: true }),
                    )
                  }
                />
              </Field>
            )}

            {/* Status (active / pending / rejected) */}
            <Field label={t('products.media.form.status')} htmlFor="media-status">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="media-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        {t('products.media.form.statusActive')}
                      </SelectItem>
                      <SelectItem value="pending">
                        {t('products.media.form.statusPending')}
                      </SelectItem>
                      <SelectItem value="rejected">
                        {t('products.media.form.statusRejected')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {formError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {formError}
              </div>
            )}
          </ModalBody>

          <ModalFooter className="shrink-0 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t('products.media.form.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {isEdit ? t('products.media.form.save') : t('products.media.form.add')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Sub-modal: Hard Delete Confirmation Modal ─────────────────────────────────

interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: MediaAsset | null;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

function DeleteConfirmModal({
  open,
  onOpenChange,
  asset,
  onConfirm,
  deleting,
}: DeleteConfirmModalProps) {
  const t = useTranslations('catalog');

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="text-destructive">
            {t('products.media.deleteConfirmTitle')}
          </ModalTitle>
          <ModalDescription>{t('products.media.deleteConfirmDesc')}</ModalDescription>
        </ModalHeader>
        {asset && (
          <ModalBody>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono text-muted-foreground break-all">
              {asset.fileKey}
            </div>
          </ModalBody>
        )}
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            {t('products.media.form.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={onConfirm}>
            {deleting ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
            {t('products.media.delete')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Main Dialog: ProductMediaDialog ───────────────────────────────────────────

export interface ProductMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  targetAssetId?: string | null;
  onManageVariants?: (product: Product) => void;
  onConfigureOptions?: (product: Product) => void;
}

export function ProductMediaDialog({
  open,
  onOpenChange,
  product,
  targetAssetId,
  onManageVariants,
  onConfigureOptions,
}: ProductMediaDialogProps) {
  const t = useTranslations('catalog');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);

  // Filter state: 'all' | 'general' | 'variant'
  const [activeFilter, setActiveFilter] = useState<'all' | 'general' | 'variant'>('all');

  // Form modal state
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    asset: MediaAsset | null;
  }>({ open: false, asset: null });

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reordering state
  const [reordering, setReordering] = useState(false);

  // Tagging in-progress state
  const [taggingId, setTaggingId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isArchived = Boolean(
    product && (Boolean(product.archivedAt) || product.status === 'archived'),
  );

  const loadData = useCallback(async () => {
    if (!product) return;
    const pId = product.id;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const [mediaList, optList, otLive, otArch] = await Promise.all([
        listProductMedia(pId),
        listProductOptions(pId),
        listOptionTypesPage({ limit: 100 }),
        listOptionTypesPage({ archived: true, limit: 100 }).catch(() => ({ optionTypes: [] })),
      ]);
      if (mounted.current && product.id === pId) {
        setMediaAssets(mediaList);
        setProductOptions(optList);
        const map = new Map<string, OptionType>();
        for (const ot of otLive.optionTypes) map.set(ot.id, ot);
        for (const ot of otArch.optionTypes) {
          if (!map.has(ot.id)) map.set(ot.id, ot);
        }
        setOptionTypes(Array.from(map.values()));
      }
    } catch (e) {
      if (mounted.current && product.id === pId) {
        setLoadError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      }
    } finally {
      if (mounted.current && product.id === pId) {
        setLoading(false);
      }
    }
  }, [product, t]);

  useEffect(() => {
    if (!open || !product) {
      setMediaAssets([]);
      setProductOptions([]);
      setOptionTypes([]);
      setActiveFilter('all');
      setFormModalState({ open: false, asset: null });
      setDeleteTarget(null);
      setActionError(null);
      setLoadError(null);
      return;
    }
    void loadData();
  }, [open, product, loadData]);

  // Option Type Map
  const optionTypeMap = useMemo(() => {
    const map = new Map<string, OptionType>();
    for (const ot of optionTypes) map.set(ot.id, ot);
    return map;
  }, [optionTypes]);

  // Cover & Lead Image Analysis (per plan/26 §5, centralized in contracts)
  const productCoverId = useMemo(() => deriveProductCoverMedia(mediaAssets)?.id, [mediaAssets]);

  const variantLeadIds = useMemo(
    () => new Set(deriveVariantLeadMediaMap(mediaAssets).values()),
    [mediaAssets],
  );

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    if (activeFilter === 'general') {
      return mediaAssets.filter((m) => m.tags.length === 0);
    }
    if (activeFilter === 'variant') {
      return mediaAssets.filter((m) => m.tags.length > 0);
    }
    return mediaAssets;
  }, [mediaAssets, activeFilter]);

  // Counts for filter pills
  const generalCount = useMemo(
    () => mediaAssets.filter((m) => m.tags.length === 0).length,
    [mediaAssets],
  );
  const variantCount = useMemo(
    () => mediaAssets.filter((m) => m.tags.length > 0).length,
    [mediaAssets],
  );

  // ── Reorder Handlers ──────────────────────────────────────────────────────────

  const handleMove = async (assetId: string, direction: 'left' | 'right') => {
    if (!product || isArchived || reordering) return;
    const currentIndex = mediaAssets.findIndex((m) => m.id === assetId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= mediaAssets.length) return;

    const reordered = [...mediaAssets];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);

    // Optimistic UI update
    setMediaAssets(reordered);
    setReordering(true);
    setActionError(null);

    try {
      const updatedList = await reorderProductMedia(product.id, {
        mediaAssetIds: reordered.map((m) => m.id),
      });
      setMediaAssets(updatedList);
      notify.saved(t('products.media.toast.reordered'));
    } catch (e) {
      // Rollback
      void loadData();
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setReordering(false);
    }
  };

  const handleSetAsCover = async (assetId: string) => {
    if (!product || isArchived || reordering) return;
    const currentIndex = mediaAssets.findIndex((m) => m.id === assetId);
    if (currentIndex <= 0) return;

    const reordered = [...mediaAssets];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.unshift(moved);

    setMediaAssets(reordered);
    setReordering(true);
    setActionError(null);

    try {
      const updatedList = await reorderProductMedia(product.id, {
        mediaAssetIds: reordered.map((m) => m.id),
      });
      setMediaAssets(updatedList);
      notify.saved(t('products.media.toast.reordered'));
    } catch (e) {
      void loadData();
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setReordering(false);
    }
  };

  // ── Delete Handler ────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteMedia(deleteTarget.id);
      setMediaAssets((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      notify.saved(t('products.media.toast.deleted'));
      setDeleteTarget(null);
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setDeleting(false);
    }
  };

  // ── Tagging Handler ───────────────────────────────────────────────────────────

  const handleTagChange = async (assetId: string, optionTypeId: string, optionValueId: string) => {
    if (isArchived) return;
    setTaggingId(assetId);
    setActionError(null);
    const ot = optionTypeMap.get(optionTypeId);
    const po = productOptions.find((p) => p.optionTypeId === optionTypeId);
    const otName = ot?.name.en ?? po?.optionTypeName?.en ?? po?.optionTypeCode ?? 'Option';

    try {
      if (!optionValueId) {
        // Clear tag on this axis
        await deleteMediaTag(assetId, optionTypeId);
        setMediaAssets((prev) =>
          prev.map((m) =>
            m.id === assetId
              ? { ...m, tags: m.tags.filter((tg) => tg.optionTypeId !== optionTypeId) }
              : m,
          ),
        );
        notify.saved(t('products.media.toast.tagRemoved'));
      } else {
        // Upsert tag on this axis
        const currentAsset = mediaAssets.find((m) => m.id === assetId);
        const updated = await putMediaTag(assetId, optionTypeId, {
          optionValueId,
          expectedUpdatedAt: currentAsset?.updatedAt,
        });
        setMediaAssets((prev) => prev.map((m) => (m.id === assetId ? updated : m)));
        notify.saved(t('products.media.toast.tagUpdated', { name: otName }));
      }
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setTaggingId(null);
    }
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <ModalHeader className="shrink-0 pr-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ModalTitle className="flex flex-wrap items-center gap-2">
                  <span>{t('products.media.dialogTitle')}</span>
                  {product && (
                    <span
                      className="max-w-xs sm:max-w-sm truncate text-sm font-normal text-muted-foreground"
                      title={product.title?.en ?? product.slug}
                    >
                      — {product.title?.en ?? product.slug}
                    </span>
                  )}
                </ModalTitle>
                <ModalDescription>
                  {isArchived
                    ? t('products.media.dialogSubtitleArchived')
                    : t('products.media.dialogSubtitle')}
                </ModalDescription>
              </div>
              {!isArchived && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setFormModalState({ open: true, asset: null })}
                  className="w-full sm:w-auto gap-1.5 shrink-0"
                >
                  <Plus className="size-4" />
                  {t('products.media.addMedia')}
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="mt-3 flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto scrollbar-none">
              <Button
                type="button"
                variant={activeFilter === 'all' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('all')}
                className="h-7 text-xs shrink-0 whitespace-nowrap"
              >
                {t('products.media.filterAll', { count: mediaAssets.length })}
              </Button>
              <Button
                type="button"
                variant={activeFilter === 'general' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('general')}
                className="h-7 text-xs shrink-0 whitespace-nowrap"
              >
                {t('products.media.filterGeneral', { count: generalCount })}
              </Button>
              <Button
                type="button"
                variant={activeFilter === 'variant' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('variant')}
                className="h-7 text-xs shrink-0 whitespace-nowrap"
              >
                {t('products.media.filterVariant', { count: variantCount })}
              </Button>
            </div>
          </ModalHeader>

          <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-3">
            {actionError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {actionError}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
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
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed border-border">
                <ImageIcon className="size-10 text-muted-foreground/60 mb-3" />
                <h3 className="font-semibold text-foreground text-sm">
                  {t('products.media.emptyTitle')}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {t('products.media.emptySubtitle')}
                </p>
                {!isArchived && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setFormModalState({ open: true, asset: null })}
                    className="mt-4 gap-1.5"
                  >
                    <Plus className="size-4" />
                    {t('products.media.addMedia')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAssets.map((asset, index) => {
                  const isCover = asset.id === productCoverId;
                  const isVariantLead = variantLeadIds.has(asset.id);
                  const isHighlighted = targetAssetId === asset.id;
                  const canMoveLeft = index > 0 && !isArchived;
                  const canMoveRight = index < mediaAssets.length - 1 && !isArchived;

                  return (
                    <div
                      key={asset.id}
                      data-media-card
                      data-media-id={asset.id}
                      className={`relative flex flex-col rounded-lg border border-border bg-card overflow-hidden shadow-xs transition-all ${
                        isHighlighted
                          ? 'ring-2 ring-primary ring-offset-2 animate-pulse'
                          : 'hover:border-primary/50'
                      }`}
                    >
                      {/* Media Thumbnail Container */}
                      <div className="relative aspect-square w-full bg-muted/40 overflow-hidden flex items-center justify-center group">
                        {asset.kind === 'image' ? (
                          <img
                            src={asset.fileKey}
                            alt={asset.alt?.en ?? 'Product media'}
                            className="size-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              // If image fails to load (e.g. storage key placeholder)
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="relative size-full flex items-center justify-center bg-black/80">
                            {asset.posterKey ? (
                              <img
                                src={asset.posterKey}
                                alt="Video poster thumbnail"
                                className="size-full object-cover opacity-80"
                              />
                            ) : null}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="flex size-10 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-md">
                                <Play className="size-5 fill-current ml-0.5" />
                              </span>
                            </div>
                            {asset.durationS != null && (
                              <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                                {asset.durationS}s
                              </span>
                            )}
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
                          {isCover && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-semibold shadow-xs">
                              <Star className="size-3 fill-current" />
                              {t('products.media.productCover')}
                            </span>
                          )}
                          {!isCover && isVariantLead && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 text-white px-1.5 py-0.5 text-[10px] font-semibold shadow-xs">
                              <Tag className="size-3" />
                              {t('products.media.variantLead')}
                            </span>
                          )}
                        </div>

                        {/* Top Right Status Badge */}
                        <div className="absolute top-2 right-2 z-10">
                          <StatusBadge
                            tone={
                              asset.status === 'active'
                                ? 'success'
                                : asset.status === 'pending'
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {asset.status}
                          </StatusBadge>
                        </div>

                        {/* Hover Overlay Actions (Desktop) */}
                        {!isArchived && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-2">
                            {canMoveLeft && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleMove(asset.id, 'left')}
                                disabled={reordering}
                                className="size-7 p-0 rounded-full bg-background/90 hover:bg-background text-foreground"
                                aria-label={t('products.media.moveLeft')}
                              >
                                <ChevronLeft className="size-4" />
                              </Button>
                            )}
                            {!isCover && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetAsCover(asset.id)}
                                disabled={reordering}
                                className="h-7 px-2 text-[10px] rounded-full gap-1 bg-background/90 hover:bg-background text-foreground"
                              >
                                <Star className="size-3" />
                                {t('products.media.setAsCover')}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFormModalState({ open: true, asset })}
                              className="size-7 p-0 rounded-full bg-background/90 hover:bg-background text-foreground"
                              aria-label={t('products.media.edit')}
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(asset)}
                              className="size-7 p-0 rounded-full"
                              aria-label={t('products.media.delete')}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                            {canMoveRight && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleMove(asset.id, 'right')}
                                disabled={reordering}
                                className="size-7 p-0 rounded-full bg-background/90 hover:bg-background text-foreground"
                                aria-label={t('products.media.moveRight')}
                              >
                                <ChevronRight className="size-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Details & Tagging */}
                      <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between text-xs">
                        <div>
                          <div className="flex items-center justify-between text-muted-foreground text-[11px] font-mono">
                            <span className="flex items-center gap-1">
                              {asset.kind === 'video' ? (
                                <Film className="size-3" />
                              ) : (
                                <ImageIcon className="size-3" />
                              )}
                              {asset.kind}
                            </span>
                            <span>pos {asset.position}</span>
                          </div>
                          {asset.alt?.en && (
                            <p className="mt-1 line-clamp-1 text-muted-foreground italic">
                              “{asset.alt.en}”
                            </p>
                          )}
                        </div>

                        {/* Variant Tagging Section */}
                        <div className="border-t border-border/60 pt-2 space-y-1.5">
                          <span className="font-semibold text-foreground text-[11px] block">
                            {t('products.media.tagsTitle')}:
                          </span>

                          {productOptions.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground italic block">
                              {t('products.media.untagged')}
                            </span>
                          ) : (
                            productOptions.map((po) => {
                              const ot = optionTypeMap.get(po.optionTypeId);
                              const otName =
                                ot?.name.en ??
                                po.optionTypeName?.en ??
                                po.optionTypeCode ??
                                'Option';
                              const currentTag = asset.tags.find(
                                (tg) => tg.optionTypeId === po.optionTypeId,
                              );
                              const isTaggingThis = taggingId === asset.id;

                              return (
                                <div key={po.optionTypeId} className="flex items-center gap-1">
                                  <label
                                    htmlFor={`tag-${asset.id}-${po.optionTypeId}`}
                                    className="text-[11px] text-muted-foreground w-12 shrink-0 truncate"
                                    title={otName}
                                  >
                                    {otName}:
                                  </label>
                                  <Select
                                    value={currentTag?.optionValueId || '__none__'}
                                    onValueChange={(v) =>
                                      handleTagChange(
                                        asset.id,
                                        po.optionTypeId,
                                        v === '__none__' ? '' : v,
                                      )
                                    }
                                    disabled={isArchived || isTaggingThis}
                                  >
                                    <SelectTrigger
                                      id={`tag-${asset.id}-${po.optionTypeId}`}
                                      className="h-7 px-1.5 text-[11px]"
                                      aria-label={`Tag ${otName}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">
                                        {t('products.media.untagged')}
                                      </SelectItem>
                                      {po.values.map((v) => (
                                        <SelectItem key={v.optionValueId} value={v.optionValueId}>
                                          {v.code}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ModalBody>

          <ModalFooter className="shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between border-t border-border pt-3 gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {onManageVariants && product && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onManageVariants(product);
                  }}
                  className="w-full sm:w-auto gap-1.5"
                >
                  <ArrowLeft className="size-4" />
                  {t('products.media.backToVariants')}
                </Button>
              )}
              {onConfigureOptions && product && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onConfigureOptions(product);
                  }}
                  className="w-full sm:w-auto gap-1.5"
                >
                  <ArrowLeft className="size-4" />
                  {t('products.media.backToOptions')}
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              {t('products.media.close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Sub-modals */}
      {product && (
        <MediaFormModal
          open={formModalState.open}
          onOpenChange={(isOpen) => setFormModalState((prev) => ({ ...prev, open: isOpen }))}
          productId={product.id}
          asset={formModalState.asset}
          onSaved={() => {
            void loadData();
          }}
        />
      )}

      <DeleteConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        asset={deleteTarget}
        onConfirm={handleConfirmDelete}
        deleting={deleting}
      />
    </>
  );
}
