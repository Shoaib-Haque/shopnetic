'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Image as ImageIcon, Layers, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import type {
  CategoryOption,
  OptionType,
  OptionValue,
  Product,
  ProductOption,
  ValueSet,
} from '@shopnetic/contracts';
import {
  Button,
  Checkbox,
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
import { listValueSets } from '@/features/catalog/value-sets/api';
import {
  deleteProductOption,
  listProductOptions,
  putProductOption,
  setProductOptionValues,
} from './api';

const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

interface ValueSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  optionType: OptionType | null;
  categoryOption: CategoryOption | null;
  valueSet: ValueSet | null;
  currentValueIds: string[];
  onSave: (selectedIds: string[]) => Promise<void>;
}

function ValueSelectModal({
  open,
  onOpenChange,
  optionType,
  categoryOption,
  valueSet,
  currentValueIds,
  onSave,
}: ValueSelectModalProps) {
  const t = useTranslations('catalog');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentValueIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(currentValueIds));
    setError(null);
  }, [currentValueIds, open]);

  // Determine selectable pool of values
  const availableValues = useMemo<OptionValue[]>(() => {
    if (!optionType) return [];
    if (categoryOption?.valueSource === 'predefined' && valueSet) {
      const allowedSet = new Set(valueSet.items.map((it) => it.optionValueId));
      return optionType.values.filter((v) => allowedSet.has(v.id) && v.status === 'active');
    }
    return optionType.values.filter((v) => v.status === 'active');
  }, [optionType, categoryOption, valueSet]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(availableValues.map((v) => v.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(Array.from(selectedIds));
      onOpenChange(false);
    } catch (e) {
      setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setSaving(false);
    }
  };

  const optName = optionType?.name.en || optionType?.code || '';

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle>{t('products.options.selectValuesTitle')}</ModalTitle>
          <ModalDescription>
            {t('products.options.selectValuesHint', { name: optName })}
          </ModalDescription>
        </ModalHeader>

        <ModalBody className="space-y-4">
          {categoryOption?.valueSource === 'predefined' && valueSet && (
            <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              {t('products.options.predefinedValues')}:{' '}
              <span className="font-medium text-foreground">{valueSet.name}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {t('products.options.selectedValuesCount', { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={deselectAll}>
                Deselect all
              </Button>
            </div>
          </div>

          {availableValues.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No active values available for this option type.
            </p>
          ) : (
            <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-input">
              {availableValues.map((val) => {
                const isChecked = selectedIds.has(val.id);
                return (
                  <label
                    key={val.id}
                    className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggle(val.id)}
                        aria-label={val.label.en || val.code}
                      />
                      <span className="font-medium text-foreground">
                        {val.label.en || val.code}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">({val.code})</span>
                    </div>
                    {val.swatchHex && (
                      <span
                        className="size-4 rounded-full border border-border shadow-xs"
                        style={{ backgroundColor: val.swatchHex }}
                        title={val.swatchHex}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t('products.options.cancel')}
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
            {t('products.options.saveValues')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function ProductOptionsDialog({
  open,
  onOpenChange,
  product,
  onManageVariants,
  onManageMedia,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onManageVariants?: (product: Product) => void;
  onManageMedia?: (product: Product) => void;
}) {
  const t = useTranslations('catalog');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);
  const [valueSets, setValueSets] = useState<ValueSet[]>([]);

  // Add Option state
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Value Select Modal state
  const [valueSelectTarget, setValueSelectTarget] = useState<string | null>(null);

  // Removing state
  const [removingId, setRemovingId] = useState<string | null>(null);

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
      const [pOpts, cOpts, otPage, vsList] = await Promise.all([
        listProductOptions(pId),
        listCategoryOptions(cId),
        listOptionTypesPage({ limit: 100 }),
        listValueSets(),
      ]);
      if (mounted.current && product.id === pId) {
        setProductOptions(pOpts);
        setCategoryOptions(cOpts);
        setOptionTypes(otPage.optionTypes);
        setValueSets(vsList);
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
      setProductOptions([]);
      setCategoryOptions([]);
      setOptionTypes([]);
      setValueSets([]);
      setSelectedToAdd('');
      setValueSelectTarget(null);
      setRemovingId(null);
      setActionError(null);
      setLoadError(null);
      return;
    }
    void loadData();
  }, [open, product, loadData]);

  // Maps
  const optionTypeMap = useMemo(() => {
    const map = new Map<string, OptionType>();
    for (const ot of optionTypes) map.set(ot.id, ot);
    return map;
  }, [optionTypes]);

  const categoryOptionMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const co of categoryOptions) map.set(co.optionTypeId, co);
    return map;
  }, [categoryOptions]);

  const valueSetMap = useMemo(() => {
    const map = new Map<string, ValueSet>();
    for (const vs of valueSets) map.set(vs.id, vs);
    return map;
  }, [valueSets]);

  const configuredOptionTypeIds = useMemo(
    () => new Set(productOptions.map((po) => po.optionTypeId)),
    [productOptions],
  );

  // Allowed category options that are not yet added to this product
  const availableToAdd = useMemo(() => {
    return categoryOptions.filter(
      (co) =>
        co.applicability !== 'not_applicable' && !configuredOptionTypeIds.has(co.optionTypeId),
    );
  }, [categoryOptions, configuredOptionTypeIds]);

  // Missing required options
  const missingRequired = useMemo(() => {
    return categoryOptions.filter(
      (co) => co.applicability === 'required' && !configuredOptionTypeIds.has(co.optionTypeId),
    );
  }, [categoryOptions, configuredOptionTypeIds]);

  const handleAddOption = async () => {
    if (!product || !selectedToAdd) return;
    setAdding(true);
    setActionError(null);
    try {
      const name = optName(selectedToAdd);
      const nextPos = productOptions.length;
      const created = await putProductOption(product.id, selectedToAdd, { position: nextPos });
      setProductOptions((prev) => [...prev, created]);
      setSelectedToAdd('');
      notify.saved(t('products.options.toast.optionAdded', { name }));
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveOption = async (optionTypeId: string) => {
    if (!product) return;
    const name = optName(optionTypeId);
    setRemovingId(optionTypeId);
    setActionError(null);
    try {
      await deleteProductOption(product.id, optionTypeId);
      setProductOptions((prev) => prev.filter((po) => po.optionTypeId !== optionTypeId));
      notify.saved(t('products.options.toast.optionRemoved', { name }));
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'CONFLICT') {
        setActionError(t('products.options.inUseByVariant'));
      } else {
        setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      }
    } finally {
      setRemovingId(null);
    }
  };

  const handleSaveValues = async (optionTypeId: string, valueIds: string[]) => {
    if (!product) return;
    const name = optName(optionTypeId);
    const updated = await setProductOptionValues(product.id, optionTypeId, {
      values: valueIds.map((id, idx) => ({ optionValueId: id, position: idx })),
    });
    setProductOptions((prev) =>
      prev.map((po) => (po.optionTypeId === optionTypeId ? updated : po)),
    );
    notify.saved(t('products.options.toast.valuesSaved', { name, count: valueIds.length }));
  };

  const handleSetRequiredValue = async (optionTypeId: string, requiredValueId: string | null) => {
    if (!product) return;
    const name = optName(optionTypeId);
    setActionError(null);
    try {
      const updated = await putProductOption(product.id, optionTypeId, {
        requiredValueId,
      });
      setProductOptions((prev) =>
        prev.map((po) => (po.optionTypeId === optionTypeId ? updated : po)),
      );
      notify.saved(t('products.options.toast.optionUpdated', { name }));
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    }
  };

  const optName = (optionTypeId: string): string => {
    const ot = optionTypeMap.get(optionTypeId);
    return ot?.name.en || ot?.code || optionTypeId;
  };

  const targetPo = productOptions.find((po) => po.optionTypeId === valueSelectTarget);
  const targetOt = valueSelectTarget ? (optionTypeMap.get(valueSelectTarget) ?? null) : null;
  const targetCo = valueSelectTarget ? (categoryOptionMap.get(valueSelectTarget) ?? null) : null;
  const targetVs = targetCo?.valueSetId ? (valueSetMap.get(targetCo.valueSetId) ?? null) : null;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-4xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5 text-primary" aria-hidden />
              <span>{t('products.options.dialogTitle')}</span>
              {product && (
                <span className="text-sm font-normal text-muted-foreground">
                  — {product.title?.en ?? product.slug}
                </span>
              )}
            </ModalTitle>
            <ModalDescription>{t('products.options.dialogSubtitle')}</ModalDescription>
          </ModalHeader>

          <ModalBody className="space-y-5">
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
                {missingRequired.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                    <p className="font-medium">
                      Missing {missingRequired.length} required category{' '}
                      {missingRequired.length === 1 ? 'axis' : 'axes'}:
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {missingRequired.map((co) => (
                        <li key={co.optionTypeId}>{optName(co.optionTypeId)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Add Option Toolbar */}
                {categoryOptions.length === 0 ? (
                  <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                    {t('products.options.noCategoryOptionsConfigured')}
                  </div>
                ) : availableToAdd.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-64 flex-1">
                      <select
                        value={selectedToAdd}
                        onChange={(e) => setSelectedToAdd(e.target.value)}
                        disabled={adding}
                        className={selectCls}
                        aria-label={t('products.options.selectOptionType')}
                      >
                        <option value="">{t('products.options.selectOptionType')}</option>
                        {availableToAdd.map((co) => {
                          const name = optName(co.optionTypeId);
                          const isReq = co.applicability === 'required';
                          const isAxis = co.isVariantAxis;
                          return (
                            <option key={co.optionTypeId} value={co.optionTypeId}>
                              {name} {isReq ? '★ (Required)' : ''}{' '}
                              {isAxis ? '[Variant Axis]' : '[Info]'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <Button
                      type="button"
                      disabled={!selectedToAdd || adding}
                      onClick={handleAddOption}
                    >
                      {adding ? <Spinner className="size-4" /> : <Plus className="size-4" />}
                      {t('products.options.addOption')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {t('products.options.noAvailableCategoryOptions')}
                  </div>
                )}

                {actionError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                    {actionError}
                  </div>
                )}

                {/* Configured Product Options Table */}
                {productOptions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t('products.options.noOptions')}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-48">Option Axis</TableHead>
                          <TableHead className="w-32">Type</TableHead>
                          <TableHead>Offered Values</TableHead>
                          <TableHead className="w-48">Single Value Skip</TableHead>
                          <TableHead className="w-20 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productOptions.map((po) => {
                          const co = categoryOptionMap.get(po.optionTypeId);
                          const name = optName(po.optionTypeId);
                          const isReq = co?.applicability === 'required';
                          const isAxis = co?.isVariantAxis ?? false;
                          const isRemoving = removingId === po.optionTypeId;

                          return (
                            <TableRow key={po.optionTypeId}>
                              <TableCell className="font-medium text-foreground">
                                <div className="flex flex-col gap-0.5">
                                  <span>{name}</span>
                                  <span className="font-mono text-xs text-muted-foreground">
                                    /{po.optionTypeCode}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {isAxis ? (
                                    <StatusBadge tone="success">
                                      {t('products.options.variantAxis')}
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="neutral">
                                      {t('products.options.informational')}
                                    </StatusBadge>
                                  )}
                                  {isReq ? (
                                    <StatusBadge tone="warning">
                                      {t('products.options.requiredByCategory')}
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="neutral">
                                      {t('products.options.optional')}
                                    </StatusBadge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {po.values.length === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">
                                        No values selected
                                      </span>
                                    ) : (
                                      po.values.map((v) => (
                                        <span
                                          key={v.optionValueId}
                                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                        >
                                          {v.code}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                  <div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      data-action="manage-values"
                                      data-option-code={po.optionTypeCode}
                                      onClick={() => setValueSelectTarget(po.optionTypeId)}
                                    >
                                      {t('products.options.manageValues')} ({po.values.length})
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {po.values.length > 0 ? (
                                  <select
                                    value={po.requiredValueId ?? ''}
                                    onChange={(e) =>
                                      handleSetRequiredValue(
                                        po.optionTypeId,
                                        e.target.value || null,
                                      )
                                    }
                                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-xs"
                                    aria-label={t('products.options.requiredValue')}
                                  >
                                    <option value="">
                                      {t('products.options.noneRequiredValue')}
                                    </option>
                                    {po.values.map((v) => (
                                      <option key={v.optionValueId} value={v.optionValueId}>
                                        Only {v.code} (Skip picker)
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRemoving}
                                  onClick={() => handleRemoveOption(po.optionTypeId)}
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label="Remove option"
                                >
                                  {isRemoving ? (
                                    <Spinner className="size-4" />
                                  ) : (
                                    <Trash2 className="size-4" />
                                  )}
                                </Button>
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
              {onManageVariants && product && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onManageVariants(product);
                  }}
                  className="gap-2"
                >
                  <Layers className="size-4" />
                  {t('products.options.proceedToVariants')}
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
              {t('products.options.close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Value Select Submodal */}
      <ValueSelectModal
        open={valueSelectTarget !== null}
        onOpenChange={(o) => {
          if (!o) setValueSelectTarget(null);
        }}
        optionType={targetOt}
        categoryOption={targetCo}
        valueSet={targetVs}
        currentValueIds={targetPo?.values.map((v) => v.optionValueId) ?? []}
        onSave={(valIds) => {
          if (!valueSelectTarget) return Promise.resolve();
          return handleSaveValues(valueSelectTarget, valIds);
        }}
      />
    </>
  );
}
