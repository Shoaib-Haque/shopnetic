'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import type {
  Category,
  CategoryOption,
  OptionApplicability,
  OptionType,
  PutCategoryOptionRequest,
  ValueSet,
  ValueSource,
} from '@shopnetic/contracts';
import {
  Button,
  Field,
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
  cn,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { listValueSets } from '@/features/catalog/value-sets/api';
import { deleteCategoryOption, listCategoryOptions, putCategoryOption } from './api';

const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

type EditState = { mode: 'create' } | { mode: 'edit'; optionTypeId: string } | null;

export function CategoryOptionsDialog({
  open,
  onOpenChange,
  category,
  onCategoryChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onCategoryChanged?: () => void;
}) {
  const t = useTranslations('catalog');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);
  const [valueSets, setValueSets] = useState<ValueSet[]>([]);

  // Editing / adding state
  const [editState, setEditState] = useState<EditState>(null);
  const [selectedOptionTypeId, setSelectedOptionTypeId] = useState('');
  const [applicability, setApplicability] = useState<OptionApplicability>('optional');
  const [isVariantAxis, setIsVariantAxis] = useState(true);
  const [valueSource, setValueSource] = useState<ValueSource>('open');
  const [valueSetId, setValueSetId] = useState<string>('');
  const [priceImpact, setPriceImpact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Deletion state
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Reset all category-scoped state immediately when category changes
  const [prevCategoryId, setPrevCategoryId] = useState<string | null>(category?.id ?? null);
  if (category && category.id !== prevCategoryId) {
    setPrevCategoryId(category.id);
    setOptions([]);
    setEditState(null);
    setLoadError(null);
    setSaveError(null);
    setRemovingId(null);
    setLoading(true);
  }

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!category) return;
    const catId = category.id;
    setLoading(true);
    setLoadError(null);
    try {
      const [opts, otPage, vsList] = await Promise.all([
        listCategoryOptions(catId),
        listOptionTypesPage({ limit: 100 }),
        listValueSets(),
      ]);
      if (mounted.current && category.id === catId) {
        setOptions(opts);
        setOptionTypes(otPage.optionTypes);
        setValueSets(vsList);
      }
    } catch (e) {
      if (mounted.current && category.id === catId) {
        setLoadError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      }
    } finally {
      if (mounted.current && category.id === catId) {
        setLoading(false);
      }
    }
  }, [category, t]);

  useEffect(() => {
    if (!open || !category) {
      setOptions([]);
      setEditState(null);
      setSaveError(null);
      setLoadError(null);
      setRemovingId(null);
      setPrevCategoryId(null);
      return;
    }
    void loadData();
  }, [open, category, loadData]);

  // Quick lookup maps
  const optionTypeMap = useMemo(() => {
    const map = new Map<string, OptionType>();
    for (const ot of optionTypes) map.set(ot.id, ot);
    return map;
  }, [optionTypes]);

  const valueSetMap = useMemo(() => {
    const map = new Map<string, ValueSet>();
    for (const vs of valueSets) map.set(vs.id, vs);
    return map;
  }, [valueSets]);

  // Unmapped active option types for create mode
  const unmappedOptionTypes = useMemo(() => {
    const mappedIds = new Set(options.map((o) => o.optionTypeId));
    return optionTypes.filter((ot) => ot.status === 'active' && !mappedIds.has(ot.id));
  }, [optionTypes, options]);

  // Value sets that match the selected option type
  const matchingValueSets = useMemo(() => {
    if (!selectedOptionTypeId) return [];
    return valueSets.filter(
      (vs) => vs.items.length > 0 && vs.items.every((i) => i.optionTypeId === selectedOptionTypeId),
    );
  }, [valueSets, selectedOptionTypeId]);

  function startCreate() {
    if (category?.archivedAt != null) return;
    const firstAvailable = unmappedOptionTypes[0]?.id ?? '';
    setSelectedOptionTypeId(firstAvailable);
    setApplicability('optional');
    setIsVariantAxis(true);
    setValueSource('open');
    setValueSetId('');
    setPriceImpact(false);
    setSaveError(null);
    setEditState({ mode: 'create' });
  }

  function startEdit(opt: CategoryOption) {
    if (category?.archivedAt != null) return;
    setSelectedOptionTypeId(opt.optionTypeId);
    setApplicability(opt.applicability);
    setIsVariantAxis(opt.isVariantAxis);
    setValueSource(opt.valueSource);
    setValueSetId(opt.valueSetId ?? '');
    setPriceImpact(opt.priceImpact);
    setSaveError(null);
    setEditState({ mode: 'edit', optionTypeId: opt.optionTypeId });
  }

  function cancelEdit() {
    setEditState(null);
    setSaveError(null);
  }

  const currentOpt = useMemo(() => {
    if (editState?.mode !== 'edit') return null;
    return options.find((o) => o.optionTypeId === editState.optionTypeId) ?? null;
  }, [editState, options]);

  const isPristine = useMemo(() => {
    if (editState?.mode !== 'edit' || !currentOpt) return false;
    const sameApplicability = applicability === currentOpt.applicability;
    const sameVariantAxis = isVariantAxis === currentOpt.isVariantAxis;
    const sameValueSource = valueSource === currentOpt.valueSource;
    const normalizedFormValueSetId = valueSource === 'open' ? null : valueSetId || null;
    const normalizedCurrentValueSetId = currentOpt.valueSetId ?? null;
    const sameValueSetId = normalizedFormValueSetId === normalizedCurrentValueSetId;
    const samePriceImpact = priceImpact === currentOpt.priceImpact;

    return (
      sameApplicability && sameVariantAxis && sameValueSource && sameValueSetId && samePriceImpact
    );
  }, [editState, currentOpt, applicability, isVariantAxis, valueSource, valueSetId, priceImpact]);

  async function handleSave() {
    if (!category || !selectedOptionTypeId) return;

    // Send only what changed — a no-op save must not write an audit event or call the API
    // (mirrors CategoryFormModal, BrandFormModal, OptionTypeFormModal)
    if (isPristine) {
      setEditState(null);
      return;
    }

    setSaving(true);
    setSaveError(null);

    // Validate value set selection when not open
    if (valueSource !== 'open' && !valueSetId) {
      setSaveError(t('errors.categoryOptionInvalid'));
      setSaving(false);
      return;
    }

    const payload: PutCategoryOptionRequest = {
      applicability,
      isVariantAxis,
      valueSource,
      valueSetId: valueSource === 'open' ? null : valueSetId,
      priceImpact,
      ...(currentOpt ? { expectedUpdatedAt: currentOpt.updatedAt } : {}),
    };

    try {
      await putCategoryOption(category.id, selectedOptionTypeId, payload);
      const otName = optionTypeMap.get(selectedOptionTypeId)?.name['en'] ?? selectedOptionTypeId;
      notify.saved(t('categories.optionsDialog.toast.saved', { name: otName }));
      setEditState(null);
      await loadData();
      onCategoryChanged?.();
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      if (code === 'CONFLICT') {
        notify.error(t('errors.conflict'));
        setEditState(null);
        await loadData();
        return;
      }
      setSaveError(t(catalogErrorKey(code)));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(opt: CategoryOption) {
    if (!category) return;
    const otName = optionTypeMap.get(opt.optionTypeId)?.name['en'] ?? opt.optionTypeCode;
    setRemovingId(opt.optionTypeId);
    try {
      await deleteCategoryOption(category.id, opt.optionTypeId);
      await loadData();
      onCategoryChanged?.();

      notify.undo(t('categories.optionsDialog.toast.removed', { name: otName }), {
        undoLabel: t('categories.undo'),
        undoneMessage: t('categories.optionsDialog.toast.restored', { name: otName }),
        onUndo: async () => {
          try {
            await putCategoryOption(category.id, opt.optionTypeId, {
              applicability: opt.applicability,
              isVariantAxis: opt.isVariantAxis,
              valueSource: opt.valueSource,
              valueSetId: opt.valueSetId,
              priceImpact: opt.priceImpact,
            });
            if (mounted.current) {
              await loadData();
            }
            onCategoryChanged?.();
          } catch (e) {
            notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
            throw e;
          }
        },
      });
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      if (mounted.current) {
        setRemovingId(null);
      }
    }
  }

  if (!category) return null;

  const isArchived = category.archivedAt != null;
  const categoryName = category.name['en'] ?? category.slug;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="xl" className="w-full" closeLabel={t('categories.optionsDialog.close')}>
        <ModalHeader>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SlidersHorizontal className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <ModalTitle
                className="min-w-0 truncate"
                title={t('categories.optionsDialog.title', { name: categoryName })}
              >
                {t('categories.optionsDialog.title', { name: categoryName })}
              </ModalTitle>
            </div>
            {isArchived && (
              <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {t('categories.optionsDialog.archivedBadge')}
              </span>
            )}
          </div>
          <ModalDescription>{t('categories.optionsDialog.description')}</ModalDescription>
        </ModalHeader>

        <ModalBody className="flex flex-col gap-4">
          {loadError && (
            <div
              className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {loadError}
            </div>
          )}

          {/* Top toolbar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t('categories.optionsDialog.cols.optionType')} ({options.length})
            </span>
            {!isArchived && editState === null && (
              <Button
                variant="outline"
                size="sm"
                onClick={startCreate}
                disabled={loading || unmappedOptionTypes.length === 0}
              >
                <Plus className="mr-1.5 size-4" aria-hidden />
                {t('categories.optionsDialog.add')}
              </Button>
            )}
          </div>

          {/* Inline Edit / Add Card */}
          {editState !== null && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3
                className="mb-3 min-w-0 truncate font-semibold text-sm"
                title={
                  editState.mode === 'create'
                    ? t('categories.optionsDialog.form.addTitle')
                    : t('categories.optionsDialog.form.editTitle', {
                        name:
                          optionTypeMap.get(selectedOptionTypeId)?.name['en'] ??
                          selectedOptionTypeId,
                      })
                }
              >
                {editState.mode === 'create'
                  ? t('categories.optionsDialog.form.addTitle')
                  : t('categories.optionsDialog.form.editTitle', {
                      name:
                        optionTypeMap.get(selectedOptionTypeId)?.name['en'] ?? selectedOptionTypeId,
                    })}
              </h3>

              {saveError && (
                <div
                  className="mb-3 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
                  role="alert"
                >
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Option type selector */}
                <Field
                  label={t('categories.optionsDialog.form.optionType')}
                  htmlFor="co-option-type"
                >
                  {editState.mode === 'create' ? (
                    <select
                      id="co-option-type"
                      className={selectCls}
                      value={selectedOptionTypeId}
                      onChange={(e) => {
                        setSelectedOptionTypeId(e.target.value);
                        setValueSetId('');
                      }}
                    >
                      {unmappedOptionTypes.length === 0 && (
                        <option value="">{t('categories.optionsDialog.form.allMapped')}</option>
                      )}
                      {unmappedOptionTypes.map((ot) => (
                        <option key={ot.id} value={ot.id}>
                          {ot.name['en'] ?? ot.code} (/{ot.code})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className="flex h-9 min-w-0 items-center rounded-md border border-muted bg-muted/30 px-3 text-sm text-foreground"
                      title={
                        optionTypeMap.get(selectedOptionTypeId)?.name['en'] ?? selectedOptionTypeId
                      }
                    >
                      <span className="truncate">
                        {optionTypeMap.get(selectedOptionTypeId)?.name['en'] ??
                          selectedOptionTypeId}
                      </span>
                    </div>
                  )}
                </Field>

                {/* Applicability */}
                <Field
                  label={t('categories.optionsDialog.form.applicability')}
                  htmlFor="co-applicability"
                  hint={t('categories.optionsDialog.form.applicabilityHint')}
                >
                  <select
                    id="co-applicability"
                    className={selectCls}
                    value={applicability}
                    onChange={(e) => setApplicability(e.target.value as OptionApplicability)}
                  >
                    <option value="optional">
                      {t('categories.optionsDialog.applicability.optional')}
                    </option>
                    <option value="required">
                      {t('categories.optionsDialog.applicability.required')}
                    </option>
                  </select>
                </Field>

                {/* Value Source */}
                <Field
                  label={t('categories.optionsDialog.form.valueSource')}
                  htmlFor="co-source"
                  hint={t('categories.optionsDialog.form.valueSourceHint')}
                >
                  <select
                    id="co-source"
                    className={selectCls}
                    value={valueSource}
                    onChange={(e) => {
                      const next = e.target.value as ValueSource;
                      setValueSource(next);
                      if (next === 'open') setValueSetId('');
                    }}
                  >
                    <option value="open">
                      {t('categories.optionsDialog.form.valueSourceOpen')}
                    </option>
                    <option value="predefined">
                      {t('categories.optionsDialog.form.valueSourcePredefined')}
                    </option>
                    <option value="hybrid">
                      {t('categories.optionsDialog.form.valueSourceHybrid')}
                    </option>
                  </select>
                </Field>

                {/* Value Set (if predefined/hybrid) */}
                {valueSource !== 'open' && (
                  <Field label={t('categories.optionsDialog.form.valueSet')} htmlFor="co-value-set">
                    <select
                      id="co-value-set"
                      className={selectCls}
                      value={valueSetId}
                      onChange={(e) => setValueSetId(e.target.value)}
                    >
                      <option value="">{t('categories.optionsDialog.form.selectValueSet')}</option>
                      {matchingValueSets.map((vs) => (
                        <option key={vs.id} value={vs.id}>
                          {vs.name}
                        </option>
                      ))}
                    </select>
                    {matchingValueSets.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        {t('categories.optionsDialog.form.noMatchingValueSets')}
                      </p>
                    )}
                  </Field>
                )}
              </div>

              {/* Switches: Variant Axis & Price Impact */}
              <div className="mt-4 flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <label
                    htmlFor="co-variant-axis"
                    className="text-sm font-medium text-foreground cursor-pointer"
                  >
                    {t('categories.optionsDialog.form.isVariantAxis')}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {t('categories.optionsDialog.form.isVariantAxisHint')}
                  </span>
                </div>
                <Switch
                  id="co-variant-axis"
                  aria-label={t('categories.optionsDialog.form.isVariantAxis')}
                  checked={isVariantAxis}
                  onCheckedChange={setIsVariantAxis}
                />
              </div>

              <div className="mt-2 flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <label
                    htmlFor="co-price-impact"
                    className="text-sm font-medium text-foreground cursor-pointer"
                  >
                    {t('categories.optionsDialog.form.priceImpact')}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {t('categories.optionsDialog.form.priceImpactHint')}
                  </span>
                </div>
                <Switch
                  id="co-price-impact"
                  aria-label={t('categories.optionsDialog.form.priceImpact')}
                  checked={priceImpact}
                  onCheckedChange={setPriceImpact}
                />
              </div>

              {/* Form action buttons */}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  {t('categories.optionsDialog.form.cancel')}
                </Button>
                <Button size="sm" onClick={() => void handleSave()} loading={saving}>
                  {t('categories.optionsDialog.form.save')}
                </Button>
              </div>
            </div>
          )}

          {/* Options Table */}
          {loading && options.length === 0 ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : options.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-8 text-center">
              <SlidersHorizontal className="size-8 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-sm font-medium text-foreground">
                {isArchived
                  ? t('categories.optionsDialog.emptyArchived')
                  : t('categories.optionsDialog.empty')}
              </p>
              {!isArchived && (
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t('categories.optionsDialog.emptyHint')}
                </p>
              )}
              {!isArchived && editState === null && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startCreate}
                  disabled={unmappedOptionTypes.length === 0}
                  className="mt-4"
                >
                  <Plus className="mr-1.5 size-4" aria-hidden />
                  {t('categories.optionsDialog.add')}
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table View (>= 768px) */}
              <div className="hidden rounded-md border border-border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('categories.optionsDialog.cols.optionType')}</TableHead>
                      <TableHead>{t('categories.optionsDialog.cols.role')}</TableHead>
                      <TableHead>{t('categories.optionsDialog.cols.applicability')}</TableHead>
                      <TableHead>{t('categories.optionsDialog.cols.valueSource')}</TableHead>
                      <TableHead>{t('categories.optionsDialog.cols.priceImpact')}</TableHead>
                      {!isArchived && (
                        <TableHead className="text-right">
                          {t('categories.optionsDialog.cols.actions')}
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {options.map((opt) => {
                      const ot = optionTypeMap.get(opt.optionTypeId);
                      const otName = ot?.name['en'] ?? opt.optionTypeCode;
                      const vs = opt.valueSetId ? valueSetMap.get(opt.valueSetId) : null;
                      const isRemoving = removingId === opt.optionTypeId;

                      return (
                        <TableRow
                          key={opt.optionTypeId}
                          data-category-option-row={opt.optionTypeId}
                          className={editState ? 'opacity-90' : undefined}
                        >
                          <TableCell className="max-w-[200px]">
                            <div className="flex min-w-0 flex-col">
                              <span
                                className="truncate font-medium text-sm text-foreground"
                                title={otName}
                              >
                                {otName}
                              </span>
                              <span
                                className="truncate text-xs text-muted-foreground"
                                title={`/${opt.optionTypeCode}`}
                              >
                                /{opt.optionTypeCode}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <StatusBadge tone={opt.isVariantAxis ? 'success' : 'neutral'}>
                              {opt.isVariantAxis
                                ? t('categories.optionsDialog.role.variantAxis')
                                : t('categories.optionsDialog.role.attribute')}
                            </StatusBadge>
                          </TableCell>

                          <TableCell>
                            <StatusBadge
                              tone={opt.applicability === 'required' ? 'warning' : 'neutral'}
                            >
                              {t(`categories.optionsDialog.applicability.${opt.applicability}`)}
                            </StatusBadge>
                          </TableCell>

                          <TableCell>
                            <div className="flex min-w-0 flex-col text-xs">
                              <span className="capitalize font-medium text-foreground">
                                {t(`categories.optionsDialog.source.${opt.valueSource}`)}
                              </span>
                              {vs && (
                                <span
                                  className="truncate max-w-[140px] text-muted-foreground"
                                  title={vs.name}
                                >
                                  {vs.name}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {opt.priceImpact
                                ? t('categories.optionsDialog.priceImpact.yes')
                                : t('categories.optionsDialog.priceImpact.no')}
                            </span>
                          </TableCell>

                          {!isArchived && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0"
                                  title={t('categories.optionsDialog.edit')}
                                  aria-label={t('categories.optionsDialog.edit')}
                                  onClick={() => startEdit(opt)}
                                  disabled={saving || isRemoving}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0 text-muted-foreground hover:text-destructive"
                                  title={t('categories.optionsDialog.remove')}
                                  aria-label={t('categories.optionsDialog.remove')}
                                  onClick={() => void handleRemove(opt)}
                                  disabled={saving || isRemoving}
                                >
                                  {isRemoving ? (
                                    <Spinner className="size-4" />
                                  ) : (
                                    <Trash2 className="size-4" aria-hidden />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View (< 768px) */}
              <ul className="divide-y divide-border rounded-md border border-border md:hidden">
                {options.map((opt) => {
                  const ot = optionTypeMap.get(opt.optionTypeId);
                  const otName = ot?.name['en'] ?? opt.optionTypeCode;
                  const vs = opt.valueSetId ? valueSetMap.get(opt.valueSetId) : null;
                  const isRemoving = removingId === opt.optionTypeId;

                  return (
                    <li
                      key={opt.optionTypeId}
                      data-category-option-card={opt.optionTypeId}
                      className={cn(
                        'flex items-start justify-between gap-3 p-3 text-sm',
                        editState ? 'opacity-90' : undefined,
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span
                            className="min-w-0 truncate font-medium text-foreground"
                            title={otName}
                          >
                            {otName}
                          </span>
                          <span
                            className="shrink-0 text-xs text-muted-foreground"
                            title={`/${opt.optionTypeCode}`}
                          >
                            /{opt.optionTypeCode}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <StatusBadge tone={opt.isVariantAxis ? 'success' : 'neutral'}>
                            {opt.isVariantAxis
                              ? t('categories.optionsDialog.role.variantAxis')
                              : t('categories.optionsDialog.role.attribute')}
                          </StatusBadge>
                          <StatusBadge
                            tone={opt.applicability === 'required' ? 'warning' : 'neutral'}
                          >
                            {t(`categories.optionsDialog.applicability.${opt.applicability}`)}
                          </StatusBadge>
                          <span className="text-muted-foreground">
                            <span className="capitalize font-medium text-foreground">
                              {t(`categories.optionsDialog.source.${opt.valueSource}`)}
                            </span>
                            {vs && (
                              <span
                                className="ml-1 inline-block max-w-[140px] truncate align-bottom text-muted-foreground"
                                title={vs.name}
                              >
                                ({vs.name})
                              </span>
                            )}
                          </span>
                          {opt.priceImpact && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {t('categories.optionsDialog.cols.priceImpact')}
                            </span>
                          )}
                        </div>
                      </div>

                      {!isArchived && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            title={t('categories.optionsDialog.edit')}
                            aria-label={t('categories.optionsDialog.edit')}
                            onClick={() => startEdit(opt)}
                            disabled={saving || isRemoving}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-destructive"
                            title={t('categories.optionsDialog.remove')}
                            aria-label={t('categories.optionsDialog.remove')}
                            onClick={() => void handleRemove(opt)}
                            disabled={saving || isRemoving}
                          >
                            {isRemoving ? (
                              <Spinner className="size-4" />
                            ) : (
                              <Trash2 className="size-4" aria-hidden />
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('categories.optionsDialog.close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
