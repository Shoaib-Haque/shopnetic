'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
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
import type {
  CreateMediaRequest,
  MediaAsset,
  MediaKind,
  MediaStatus,
  OptionType,
  Product,
  ProductOption,
  UpdateMediaRequest,
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
  Skeleton,
  Spinner,
  StatusBadge,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
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

function MediaFormModal({ open, onOpenChange, productId, asset, onSaved }: MediaFormModalProps) {
  const t = useTranslations('catalog');
  const isEdit = asset !== null;

  const [kind, setKind] = useState<MediaKind>('image');
  const [fileKey, setFileKey] = useState('');
  const [posterKey, setPosterKey] = useState('');
  const [alt, setAlt] = useState('');
  const [durationS, setDurationS] = useState('');
  const [status, setStatus] = useState<MediaStatus>('active');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setKind('image');
      setFileKey('');
      setPosterKey('');
      setAlt('');
      setDurationS('');
      setStatus('active');
      setFormError(null);
      return;
    }

    if (asset) {
      setKind(asset.kind);
      setFileKey(asset.fileKey);
      setPosterKey(asset.posterKey ?? '');
      setAlt(asset.alt?.en ?? '');
      setDurationS(asset.durationS != null ? String(asset.durationS) : '');
      setStatus(asset.status);
    } else {
      setKind('image');
      setFileKey('');
      setPosterKey('');
      setAlt('');
      setDurationS('');
      setStatus('active'); // Defaults straight to active for staff
    }
  }, [open, asset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFileKey = fileKey.trim();
    if (!cleanFileKey) {
      setFormError(t('products.media.form.err.fileKeyRequired'));
      return;
    }

    const cleanPosterKey = posterKey.trim();
    if (kind === 'video' && !cleanPosterKey) {
      setFormError(t('products.media.form.err.posterKeyRequired'));
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (isEdit && asset) {
        const req: UpdateMediaRequest = {
          fileKey: cleanFileKey,
          posterKey: cleanPosterKey || null,
          alt: alt.trim() ? { en: alt.trim() } : null,
          durationS: durationS ? Number(durationS) : null,
          status,
        };
        const updated = await updateMedia(asset.id, req);
        onSaved(updated);
        notify.saved(t('products.media.toast.updated'));
        onOpenChange(false);
      } else {
        const req: CreateMediaRequest = {
          kind,
          fileKey: cleanFileKey,
          posterKey: cleanPosterKey || null,
          alt: alt.trim() ? { en: alt.trim() } : undefined,
          durationS: durationS ? Number(durationS) : undefined,
          status,
        };
        const created = await createProductMedia(productId, req);
        onSaved(created);
        notify.saved(t('products.media.toast.added'));
        onOpenChange(false);
      }
    } catch (err) {
      setFormError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>
              {isEdit ? t('products.media.form.editTitle') : t('products.media.form.addTitle')}
            </ModalTitle>
            <ModalDescription>{t('products.media.dialogSubtitle')}</ModalDescription>
          </ModalHeader>

          <ModalBody className="space-y-4">
            {/* Kind Selector */}
            {!isEdit && (
              <Field label={t('products.media.form.kind')} htmlFor="media-kind">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={kind === 'image' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setKind('image')}
                    className="flex-1 gap-1.5"
                  >
                    <ImageIcon className="size-4" />
                    {t('products.media.kindImage')}
                  </Button>
                  <Button
                    type="button"
                    variant={kind === 'video' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setKind('video')}
                    className="flex-1 gap-1.5"
                  >
                    <Film className="size-4" />
                    {t('products.media.kindVideo')}
                  </Button>
                </div>
              </Field>
            )}

            {/* File Key / URL */}
            <Field label={t('products.media.form.fileKey')} htmlFor="media-file-key">
              <Input
                id="media-file-key"
                value={fileKey}
                onChange={(e) => setFileKey(e.target.value)}
                placeholder={t('products.media.form.fileKeyPlaceholder')}
                required
              />
            </Field>

            {/* Poster Key (Videos only) */}
            {kind === 'video' && (
              <Field
                label={t('products.media.form.posterKey')}
                htmlFor="media-poster-key"
                hint={t('products.media.form.posterKeyHint')}
              >
                <Input
                  id="media-poster-key"
                  value={posterKey}
                  onChange={(e) => setPosterKey(e.target.value)}
                  placeholder={t('products.media.form.posterKeyPlaceholder')}
                  required
                />
              </Field>
            )}

            {/* Alt Text */}
            <Field label={t('products.media.form.alt')} htmlFor="media-alt">
              <Input
                id="media-alt"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder={t('products.media.form.altPlaceholder')}
              />
            </Field>

            {/* Duration (Videos only) */}
            {kind === 'video' && (
              <Field label={t('products.media.form.durationS')} htmlFor="media-duration">
                <Input
                  id="media-duration"
                  type="number"
                  min="1"
                  max="86400"
                  value={durationS}
                  onChange={(e) => setDurationS(e.target.value)}
                  placeholder={t('products.media.form.durationPlaceholder')}
                />
              </Field>
            )}

            {/* Status (active / pending / rejected) */}
            <Field label={t('products.media.form.status')} htmlFor="media-status">
              <select
                id="media-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as MediaStatus)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">{t('products.media.form.statusActive')}</option>
                <option value="pending">{t('products.media.form.statusPending')}</option>
                <option value="rejected">{t('products.media.form.statusRejected')}</option>
              </select>
            </Field>

            {formError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {formError}
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t('products.media.form.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
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
      const [mediaList, optList, otPage] = await Promise.all([
        listProductMedia(pId),
        listProductOptions(pId),
        listOptionTypesPage({ limit: 100 }),
      ]);
      if (mounted.current && product.id === pId) {
        setMediaAssets(mediaList);
        setProductOptions(optList);
        setOptionTypes(otPage.optionTypes);
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

  // Cover & Lead Image Analysis (per plan/26 §5)
  // Product Cover = lowest position untagged asset (or lowest position overall if none untagged)
  const productCoverId = useMemo(() => {
    const untagged = mediaAssets.filter((m) => m.tags.length === 0);
    if (untagged.length > 0) return untagged[0]?.id;
    return mediaAssets[0]?.id;
  }, [mediaAssets]);

  // Variant Lead IDs = for each unique tag (optionValueId), the asset with lowest position
  const variantLeadIds = useMemo(() => {
    const leadMap = new Map<string, string>(); // optionValueId -> mediaAssetId
    for (const asset of mediaAssets) {
      for (const tag of asset.tags) {
        if (!leadMap.has(tag.optionValueId)) {
          leadMap.set(tag.optionValueId, asset.id);
        }
      }
    }
    return new Set(leadMap.values());
  }, [mediaAssets]);

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
    const otName = ot?.name.en ?? optionTypeId;

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
        const updated = await putMediaTag(assetId, optionTypeId, { optionValueId });
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
        <ModalContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <ModalHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <ModalTitle>{t('products.media.dialogTitle')}</ModalTitle>
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
                  className="gap-1.5 shrink-0"
                >
                  <Plus className="size-4" />
                  {t('products.media.addMedia')}
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="mt-3 flex items-center gap-1.5 border-b border-border pb-2">
              <Button
                type="button"
                variant={activeFilter === 'all' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('all')}
                className="h-7 text-xs"
              >
                {t('products.media.filterAll', { count: mediaAssets.length })}
              </Button>
              <Button
                type="button"
                variant={activeFilter === 'general' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('general')}
                className="h-7 text-xs"
              >
                {t('products.media.filterGeneral', { count: generalCount })}
              </Button>
              <Button
                type="button"
                variant={activeFilter === 'variant' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('variant')}
                className="h-7 text-xs"
              >
                {t('products.media.filterVariant', { count: variantCount })}
              </Button>
            </div>
          </ModalHeader>

          <ModalBody className="flex-1 overflow-y-auto space-y-4 py-3">
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
                              const otName = ot?.name.en ?? po.optionTypeCode;
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
                                  <select
                                    id={`tag-${asset.id}-${po.optionTypeId}`}
                                    disabled={isArchived || isTaggingThis}
                                    value={currentTag?.optionValueId ?? ''}
                                    onChange={(e) =>
                                      handleTagChange(asset.id, po.optionTypeId, e.target.value)
                                    }
                                    className="h-7 w-full rounded border border-input bg-background px-1.5 text-[11px] shadow-xs"
                                    aria-label={`Tag ${otName}`}
                                  >
                                    <option value="">{t('products.media.untagged')}</option>
                                    {po.values.map((v) => (
                                      <option key={v.optionValueId} value={v.optionValueId}>
                                        {v.code}
                                      </option>
                                    ))}
                                  </select>
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

          <ModalFooter className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2">
              {onManageVariants && product && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onManageVariants(product);
                  }}
                  className="gap-1.5"
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
                  className="gap-1.5"
                >
                  <ArrowLeft className="size-4" />
                  {t('products.media.backToOptions')}
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
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
