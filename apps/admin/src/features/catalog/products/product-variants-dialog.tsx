'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Edit2,
  Grid,
  Image as ImageIcon,
  Layers,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  CategoryOption,
  CreateVariantRequest,
  OptionType,
  Product,
  ProductOption,
  UpdateVariantRequest,
  Variant,
  VariantSelection,
} from '@shopnetic/contracts';
import {
  Button,
  Checkbox,
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { listCategoryOptions } from '@/features/catalog/categories/api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import {
  createVariant,
  deleteVariant,
  listProductOptions,
  listVariants,
  updateVariant,
} from './api';

const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function signatureOf(selections: VariantSelection[]): string {
  return [...selections]
    .sort((a, b) => a.optionTypeId.localeCompare(b.optionTypeId))
    .map((s) => `${s.optionTypeId}:${s.optionValueId}`)
    .join(';');
}

interface ComboOptionItem {
  optionTypeId: string;
  optionValueId: string;
  typeCode: string;
  typeName: string;
  valueCode: string;
  valueLabel: string;
}

interface CartesianCombo {
  signature: string;
  items: ComboOptionItem[];
  suggestedSku: string;
}

// ── Cartesian Generator Modal ────────────────────────────────────────────────

interface GeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  productOptions: ProductOption[];
  categoryOptions: CategoryOption[];
  optionTypeMap: Map<string, OptionType>;
  existingVariants: Variant[];
  onGenerated: (created: Variant[]) => void;
}

function GeneratorModal({
  open,
  onOpenChange,
  product,
  productOptions,
  categoryOptions,
  optionTypeMap,
  existingVariants,
  onGenerated,
}: GeneratorModalProps) {
  const t = useTranslations('catalog');
  const [skuPrefix, setSkuPrefix] = useState('');
  const [defaultStatus, setDefaultStatus] = useState<'active' | 'inactive'>('active');
  const [selectedCombos, setSelectedCombos] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const categoryOptionMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const co of categoryOptions) map.set(co.optionTypeId, co);
    return map;
  }, [categoryOptions]);

  // Variant axes only
  const variantAxes = useMemo(() => {
    return productOptions.filter((po) => {
      const co = categoryOptionMap.get(po.optionTypeId);
      return co?.isVariantAxis === true;
    });
  }, [productOptions, categoryOptionMap]);

  // Existing signatures
  const existingSignatures = useMemo(() => {
    return new Set(existingVariants.map((v) => v.comboSignature));
  }, [existingVariants]);

  // Compute Cartesian combinations
  const { allCombos, newCombos } = useMemo(() => {
    if (variantAxes.length === 0) {
      const emptySig = '';
      const combo: CartesianCombo = {
        signature: emptySig,
        items: [],
        suggestedSku: '',
      };
      const isNew = !existingSignatures.has(emptySig);
      return {
        allCombos: [combo],
        newCombos: isNew ? [combo] : [],
      };
    }

    // Check if any axis has 0 values
    for (const axis of variantAxes) {
      if (axis.values.length === 0) {
        return { allCombos: [], newCombos: [] };
      }
    }

    // Cartesian product
    let current: ComboOptionItem[][] = [[]];
    for (const axis of variantAxes) {
      const ot = optionTypeMap.get(axis.optionTypeId);
      const next: ComboOptionItem[][] = [];
      for (const row of current) {
        for (const val of axis.values) {
          const matchedVal = ot?.values.find((v) => v.id === val.optionValueId);
          next.push([
            ...row,
            {
              optionTypeId: axis.optionTypeId,
              optionValueId: val.optionValueId,
              typeCode: axis.optionTypeCode,
              typeName: ot?.name.en || axis.optionTypeCode,
              valueCode: val.code,
              valueLabel: matchedVal?.label.en || val.code,
            },
          ]);
        }
      }
      current = next;
    }

    const combos: CartesianCombo[] = current.map((items) => {
      const sel: VariantSelection[] = items.map((it) => ({
        optionTypeId: it.optionTypeId,
        optionValueId: it.optionValueId,
      }));
      const sig = signatureOf(sel);
      const skuParts = items.map((it) => it.valueCode.toUpperCase()).join('-');
      return {
        signature: sig,
        items,
        suggestedSku: skuParts,
      };
    });

    const newOnes = combos.filter((c) => !existingSignatures.has(c.signature));
    return { allCombos: combos, newCombos: newOnes };
  }, [variantAxes, optionTypeMap, existingSignatures]);

  // Default select all new combos when modal opens or list changes
  useEffect(() => {
    if (open) {
      setSelectedCombos(new Set(newCombos.map((c) => c.signature)));
      setGenError(null);
    }
  }, [open, newCombos]);

  const toggleCombo = (sig: string) => {
    setSelectedCombos((prev) => {
      const next = new Set(prev);
      if (next.has(sig)) next.delete(sig);
      else next.add(sig);
      return next;
    });
  };

  const selectAll = () => setSelectedCombos(new Set(newCombos.map((c) => c.signature)));
  const deselectAll = () => setSelectedCombos(new Set());

  const handleGenerate = async () => {
    const toCreate = newCombos.filter((c) => selectedCombos.has(c.signature));
    if (toCreate.length === 0) return;

    setGenerating(true);
    setGenError(null);
    const createdList: Variant[] = [];
    const prefix = skuPrefix.trim();

    try {
      for (let i = 0; i < toCreate.length; i++) {
        const c = toCreate[i]!;
        const sku = prefix ? `${prefix}${c.suggestedSku}` : c.suggestedSku || undefined;
        const selections: VariantSelection[] = c.items.map((it) => ({
          optionTypeId: it.optionTypeId,
          optionValueId: it.optionValueId,
        }));
        const req: CreateVariantRequest = {
          selections,
          skuCode: sku,
          status: defaultStatus,
          position: existingVariants.length + i,
        };
        const created = await createVariant(product.id, req);
        createdList.push(created);
      }
      onGenerated(createdList);
      notify.saved(t('products.variants.toast.generated', { count: createdList.length }));
      onOpenChange(false);
    } catch (e) {
      setGenError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      if (createdList.length > 0) {
        onGenerated(createdList);
      }
    } finally {
      setGenerating(false);
    }
  };

  const total = allCombos.length;
  const existingCount = total - newCombos.length;
  const isHighCount = total > 100;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" aria-hidden />
            <span>{t('products.variants.matrix.title')}</span>
          </ModalTitle>
          <ModalDescription>{t('products.variants.matrix.description')}</ModalDescription>
        </ModalHeader>

        <ModalBody className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium text-foreground">
              {t('products.variants.matrix.totalCombos', { total })}
            </p>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>{t('products.variants.matrix.existingCount', { count: existingCount })}</span>
              <span>•</span>
              <span className="font-medium text-primary">
                {t('products.variants.matrix.newCount', { count: newCombos.length })}
              </span>
            </div>
          </div>

          {isHighCount && (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>{t('products.variants.matrix.warningHighCombos')}</span>
            </div>
          )}

          {/* Configuration toolbar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('products.variants.matrix.skuPrefix')}>
              <Input
                value={skuPrefix}
                onChange={(e) => setSkuPrefix(e.target.value)}
                placeholder={t('products.variants.matrix.skuPrefixPlaceholder')}
                className="h-9"
              />
            </Field>

            <Field label={t('products.variants.matrix.defaultStatus')}>
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as 'active' | 'inactive')}
                className={selectCls}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          {/* Combinations checklist */}
          {newCombos.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('products.variants.matrix.noNewCombos')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {selectedCombos.size} of {newCombos.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                    {t('products.variants.matrix.selectAll')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={deselectAll}>
                    {t('products.variants.matrix.deselectAll')}
                  </Button>
                </div>
              </div>

              <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-input">
                {newCombos.map((combo) => {
                  const isChecked = selectedCombos.has(combo.signature);
                  return (
                    <label
                      key={combo.signature}
                      className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleCombo(combo.signature)}
                          aria-label={combo.suggestedSku || 'Variant'}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {combo.items.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              Single / Default Variant
                            </span>
                          ) : (
                            combo.items.map((it) => (
                              <span
                                key={it.optionTypeId}
                                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                              >
                                {it.typeName}: {it.valueLabel}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      {combo.suggestedSku && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {skuPrefix ? `${skuPrefix}${combo.suggestedSku}` : combo.suggestedSku}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {genError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
              {genError}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={generating}
            onClick={() => onOpenChange(false)}
          >
            {t('products.variants.form.cancel')}
          </Button>
          <Button
            type="button"
            disabled={generating || selectedCombos.size === 0}
            onClick={handleGenerate}
          >
            {generating ? (
              <>
                <Spinner className="size-4" />
                <span>{t('products.variants.matrix.generating')}</span>
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                <span>
                  {t('products.variants.matrix.generateSelected', { count: selectedCombos.size })}
                </span>
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Edit / Create Single Variant Modal ───────────────────────────────────────

interface VariantFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  variant: Variant | null;
  productOptions: ProductOption[];
  categoryOptions: CategoryOption[];
  optionTypeMap: Map<string, OptionType>;
  onSaved: (variant: Variant) => void;
}

function VariantFormModal({
  open,
  onOpenChange,
  product,
  variant,
  productOptions,
  categoryOptions,
  optionTypeMap,
  onSaved,
}: VariantFormModalProps) {
  const t = useTranslations('catalog');
  const [skuCode, setSkuCode] = useState('');
  const [gtin, setGtin] = useState('');
  const [weightG, setWeightG] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Manual selections state (when creating a single variant)
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = variant !== null;

  const categoryOptionMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const co of categoryOptions) map.set(co.optionTypeId, co);
    return map;
  }, [categoryOptions]);

  const variantAxes = useMemo(() => {
    return productOptions.filter((po) => {
      const co = categoryOptionMap.get(po.optionTypeId);
      return co?.isVariantAxis === true;
    });
  }, [productOptions, categoryOptionMap]);

  useEffect(() => {
    if (variant) {
      setSkuCode(variant.skuCode ?? '');
      setGtin(variant.gtin ?? '');
      setWeightG(variant.weightG != null ? String(variant.weightG) : '');
      const d = variant.dims as { length?: number; width?: number; height?: number } | null;
      setLength(d?.length != null ? String(d.length) : '');
      setWidth(d?.width != null ? String(d.width) : '');
      setHeight(d?.height != null ? String(d.height) : '');
      setStatus(variant.status);
      setFormError(null);
    } else {
      setSkuCode('');
      setGtin('');
      setWeightG('');
      setLength('');
      setWidth('');
      setHeight('');
      setStatus('active');
      setManualSelections({});
      setFormError(null);
    }
  }, [variant, open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    // Validate GTIN if provided
    const cleanGtin = gtin.trim();
    if (cleanGtin && !/^[0-9]{8,14}$/.test(cleanGtin)) {
      setFormError(t('products.variants.form.gtinHint'));
      setSaving(false);
      return;
    }

    const dimsObj =
      length || width || height
        ? {
            ...(length ? { length: Number(length) } : {}),
            ...(width ? { width: Number(width) } : {}),
            ...(height ? { height: Number(height) } : {}),
          }
        : null;

    try {
      if (isEdit && variant) {
        const req: UpdateVariantRequest = {
          skuCode: skuCode.trim() || null,
          gtin: cleanGtin || null,
          weightG: weightG ? Number(weightG) : null,
          dims: dimsObj,
          status,
        };
        const updated = await updateVariant(product.id, variant.id, req);
        onSaved(updated);
        notify.saved(t('products.variants.toast.updated'));
        onOpenChange(false);
      } else {
        // Build selections
        const selections: VariantSelection[] = variantAxes.map((axis) => ({
          optionTypeId: axis.optionTypeId,
          optionValueId: manualSelections[axis.optionTypeId] ?? '',
        }));

        if (selections.some((s) => !s.optionValueId)) {
          setFormError(t('products.variants.form.selectValues'));
          setSaving(false);
          return;
        }

        const req: CreateVariantRequest = {
          selections,
          skuCode: skuCode.trim() || null,
          gtin: cleanGtin || null,
          weightG: weightG ? Number(weightG) : null,
          dims: dimsObj,
          status,
        };
        const created = await createVariant(product.id, req);
        onSaved(created);
        notify.saved(t('products.variants.toast.created'));
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
      <ModalContent className="max-w-lg">
        <form onSubmit={handleSave}>
          <ModalHeader>
            <ModalTitle>
              {isEdit
                ? t('products.variants.form.editTitle')
                : t('products.variants.form.newTitle')}
            </ModalTitle>
            <ModalDescription>
              {isEdit
                ? t('products.variants.form.combinationLocked')
                : t('products.variants.form.selectValues')}
            </ModalDescription>
          </ModalHeader>

          <ModalBody className="space-y-4">
            {/* Selections section */}
            {isEdit && variant ? (
              <div className="rounded-md bg-muted/50 p-2.5">
                <span className="text-xs font-medium text-muted-foreground">Combination:</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {variant.selections.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      Single / Default Variant
                    </span>
                  ) : (
                    variant.selections.map((sel) => {
                      const ot = optionTypeMap.get(sel.optionTypeId);
                      const ov = ot?.values.find((v) => v.id === sel.optionValueId);
                      return (
                        <span
                          key={sel.optionTypeId}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {ot?.name.en ?? sel.optionTypeId}:{' '}
                          {ov?.label.en ?? ov?.code ?? sel.optionValueId}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            ) : !isEdit && variantAxes.length > 0 ? (
              <div className="space-y-2 rounded-md border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t('products.variants.form.selectValues')}
                </p>
                {variantAxes.map((axis) => {
                  const ot = optionTypeMap.get(axis.optionTypeId);
                  const name = ot?.name.en || axis.optionTypeCode;
                  return (
                    <Field key={axis.optionTypeId} label={name}>
                      <select
                        value={manualSelections[axis.optionTypeId] ?? ''}
                        onChange={(e) =>
                          setManualSelections((prev) => ({
                            ...prev,
                            [axis.optionTypeId]: e.target.value,
                          }))
                        }
                        className={selectCls}
                        required
                      >
                        <option value="">Select a value…</option>
                        {axis.values.map((v) => {
                          const valObj = ot?.values.find((val) => val.id === v.optionValueId);
                          return (
                            <option key={v.optionValueId} value={v.optionValueId}>
                              {valObj?.label.en ?? v.code}
                            </option>
                          );
                        })}
                      </select>
                    </Field>
                  );
                })}
              </div>
            ) : null}

            {/* SKU and GTIN */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('products.variants.form.sku')}>
                <Input
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  placeholder={t('products.variants.form.skuPlaceholder')}
                />
              </Field>

              <Field
                label={t('products.variants.form.gtin')}
                hint={t('products.variants.form.gtinHint')}
              >
                <Input
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder={t('products.variants.form.gtinPlaceholder')}
                />
              </Field>
            </div>

            {/* Weight and Dimensions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('products.variants.form.weightG')}>
                <Input
                  type="number"
                  min="0"
                  value={weightG}
                  onChange={(e) => setWeightG(e.target.value)}
                  placeholder={t('products.variants.form.weightPlaceholder')}
                />
              </Field>

              <Field label={t('products.variants.form.dimensions')}>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    placeholder="L"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="W"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="H"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </div>
              </Field>
            </div>

            {/* Status toggle */}
            <div className="flex items-center justify-between rounded-md border border-input p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('products.variants.form.active')}
                </p>
                <p className="text-xs text-muted-foreground">
                  Inactive variants cannot be purchased on storefront.
                </p>
              </div>
              <Switch
                checked={status === 'active'}
                onCheckedChange={(c) => setStatus(c ? 'active' : 'inactive')}
                aria-label={t('products.variants.form.active')}
              />
            </div>

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
              {t('products.variants.form.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
              {isEdit ? t('products.variants.form.save') : t('products.variants.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Main ProductVariantsDialog ───────────────────────────────────────────────

export function ProductVariantsDialog({
  open,
  onOpenChange,
  product,
  onBackToOptions,
  onManageMedia,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onBackToOptions?: (product: Product) => void;
  onManageMedia?: (product: Product) => void;
}) {
  const t = useTranslations('catalog');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);

  // Sub-modals
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    variant: Variant | null;
  }>({ open: false, variant: null });

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!product) return;
    const pId = product.id;
    const cId = product.categoryId;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const [vars, pOpts, cOpts, otPage] = await Promise.all([
        listVariants(pId),
        listProductOptions(pId),
        listCategoryOptions(cId),
        listOptionTypesPage({ limit: 100 }),
      ]);
      if (mounted.current && product.id === pId) {
        setVariants(vars);
        setProductOptions(pOpts);
        setCategoryOptions(cOpts);
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
      setVariants([]);
      setProductOptions([]);
      setCategoryOptions([]);
      setOptionTypes([]);
      setGeneratorOpen(false);
      setFormModalState({ open: false, variant: null });
      setActionError(null);
      setLoadError(null);
      return;
    }
    void loadData();
  }, [open, product, loadData]);

  const optionTypeMap = useMemo(() => {
    const map = new Map<string, OptionType>();
    for (const ot of optionTypes) map.set(ot.id, ot);
    return map;
  }, [optionTypes]);

  const handleDeleteVariant = async (variantId: string) => {
    if (!product) return;
    setDeletingId(variantId);
    setActionError(null);
    try {
      await deleteVariant(product.id, variantId);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
      notify.saved(t('products.variants.toast.deleted'));
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerated = (newlyCreated: Variant[]) => {
    setVariants((prev) => [...prev, ...newlyCreated]);
  };

  const handleSaved = (v: Variant) => {
    setVariants((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      return exists ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v];
    });
  };

  const formatDims = (dims: unknown): string => {
    if (!dims || typeof dims !== 'object') return '—';
    const d = dims as { length?: number; width?: number; height?: number };
    if (!d.length && !d.width && !d.height) return '—';
    return `${d.length ?? 0}×${d.width ?? 0}×${d.height ?? 0} mm`;
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-5xl">
          <ModalHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ModalTitle className="flex items-center gap-2">
                  <Layers className="size-5 text-primary" aria-hidden />
                  <span>{t('products.variants.dialogTitle')}</span>
                  {product && (
                    <span className="text-sm font-normal text-muted-foreground">
                      — {product.title?.en ?? product.slug}
                    </span>
                  )}
                </ModalTitle>
                <ModalDescription>{t('products.variants.dialogSubtitle')}</ModalDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGeneratorOpen(true)}
                  disabled={loading}
                >
                  <Wand2 className="size-4" />
                  {t('products.variants.generate')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setFormModalState({ open: true, variant: null })}
                  disabled={loading}
                >
                  <Plus className="size-4" />
                  {t('products.variants.createSingle')}
                </Button>
              </div>
            </div>
          </ModalHeader>

          <ModalBody className="space-y-4">
            {loading ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadData()}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {actionError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                    {actionError}
                  </div>
                )}

                {variants.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-12 text-center">
                    <Grid className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {t('products.variants.emptyTitle')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('products.variants.emptySubtitle')}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      {onBackToOptions && product && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false);
                            onBackToOptions(product);
                          }}
                        >
                          <ArrowLeft className="size-4" />
                          {t('products.variants.backToOptions')}
                        </Button>
                      )}
                      <Button type="button" size="sm" onClick={() => setGeneratorOpen(true)}>
                        <Wand2 className="size-4" />
                        {t('products.variants.generate')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('products.variants.table.combination')}</TableHead>
                          <TableHead className="w-36">{t('products.variants.table.sku')}</TableHead>
                          <TableHead className="w-36">
                            {t('products.variants.table.gtin')}
                          </TableHead>
                          <TableHead className="w-24">
                            {t('products.variants.table.weight')}
                          </TableHead>
                          <TableHead className="w-32">
                            {t('products.variants.table.dimensions')}
                          </TableHead>
                          <TableHead className="w-24">
                            {t('products.variants.table.status')}
                          </TableHead>
                          <TableHead className="w-20 text-right">
                            {t('products.variants.table.actions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variants.map((v) => {
                          const isDeleting = deletingId === v.id;
                          return (
                            <TableRow key={v.id}>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {v.selections.length === 0 ? (
                                    <span className="text-xs text-muted-foreground italic">
                                      Single / Base Variant
                                    </span>
                                  ) : (
                                    v.selections.map((sel) => {
                                      const ot = optionTypeMap.get(sel.optionTypeId);
                                      const ov = ot?.values.find(
                                        (val) => val.id === sel.optionValueId,
                                      );
                                      return (
                                        <span
                                          key={sel.optionTypeId}
                                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                        >
                                          {ot?.name.en ?? sel.optionTypeId}:{' '}
                                          {ov?.label.en ?? ov?.code ?? sel.optionValueId}
                                        </span>
                                      );
                                    })
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {v.skuCode || '—'}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {v.gtin || '—'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {v.weightG != null ? `${v.weightG}g` : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDims(v.dims)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge tone={v.status === 'active' ? 'success' : 'neutral'}>
                                  {v.status}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFormModalState({ open: true, variant: v })}
                                    aria-label="Edit variant"
                                  >
                                    <Edit2 className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteVariant(v.id)}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    aria-label="Delete variant"
                                  >
                                    {isDeleting ? (
                                      <Spinner className="size-3.5" />
                                    ) : (
                                      <Trash2 className="size-3.5" />
                                    )}
                                  </Button>
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

          <ModalFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onBackToOptions && product && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onBackToOptions(product);
                  }}
                  className="gap-2"
                >
                  <ArrowLeft className="size-4" />
                  {t('products.variants.backToOptions')}
                </Button>
              )}
              {onManageMedia && product && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onManageMedia(product);
                  }}
                  className="gap-2"
                >
                  <ImageIcon className="size-4" />
                  {t('products.mediaAction')}
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Generator Sub-modal */}
      {product && (
        <GeneratorModal
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          product={product}
          productOptions={productOptions}
          categoryOptions={categoryOptions}
          optionTypeMap={optionTypeMap}
          existingVariants={variants}
          onGenerated={handleGenerated}
        />
      )}

      {/* Edit / Create Single Variant Sub-modal */}
      {product && (
        <VariantFormModal
          open={formModalState.open}
          onOpenChange={(o) => {
            if (!o) setFormModalState({ open: false, variant: null });
          }}
          product={product}
          variant={formModalState.variant}
          productOptions={productOptions}
          categoryOptions={categoryOptions}
          optionTypeMap={optionTypeMap}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
