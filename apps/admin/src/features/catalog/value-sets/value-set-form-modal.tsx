'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionType, ValueSet, ValueSetItem } from '@shopnetic/contracts';
import { Button, cn, Field, Input, Spinner } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { getOptionType, listOptionTypesPage } from '@/features/catalog/option-types/api';
import { capForMessage } from '@/lib/format';
import {
  addValueSetItem,
  createValueSet,
  getValueSet,
  removeValueSetItem,
  reorderValueSetItems,
  updateValueSet,
} from './api';

const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'valueSets.form.err.required')
    .max(120, 'valueSets.form.err.nameLong'),
  optionTypeId: z.string().min(1, 'valueSets.form.err.optionTypeRequired'),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  name: '',
  optionTypeId: '',
};

const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  VALUE_SET_NAME_TAKEN: 'name',
};

export interface ValueSetFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit' | 'view';
  valueSet?: ValueSet | undefined;
  optionTypes?: OptionType[];
  onSaved?: (action: 'created' | 'updated', vs: ValueSet) => void;
  onDelete?: (vs: ValueSet) => void;
  onValuesChanged?: (vs: ValueSet) => void;
  onConflict?: () => void;
}

export function ValueSetFormModal({
  open,
  onOpenChange,
  mode,
  valueSet,
  optionTypes: initialOptionTypes,
  onSaved,
  onDelete,
  onValuesChanged,
  onConflict,
}: ValueSetFormModalProps) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);

  // Available option types list
  const [optionTypes, setOptionTypes] = useState<OptionType[]>(initialOptionTypes ?? []);
  const [loadingOptionTypes, setLoadingOptionTypes] = useState(false);

  // The active option type for the currently selected optionTypeId (with its OptionValues)
  const [selectedOptionType, setSelectedOptionType] = useState<OptionType | null>(null);
  const [loadingOptionTypeDetails, setLoadingOptionTypeDetails] = useState(false);

  // State tracking value set data and child items
  const [currentValueSet, setCurrentValueSet] = useState<ValueSet | undefined>(valueSet);
  const [items, setItems] = useState<ValueSetItem[]>([]);
  const [selectedValueIdToAdd, setSelectedValueIdToAdd] = useState('');
  const [itemActionInProgress, setItemActionInProgress] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: EMPTY,
  });

  const watchedOptionTypeId = watch('optionTypeId');

  // Load active option types if not provided
  useEffect(() => {
    if (!open) return;
    if (initialOptionTypes && initialOptionTypes.length > 0) {
      setOptionTypes(initialOptionTypes);
      return;
    }
    setLoadingOptionTypes(true);
    listOptionTypesPage({ status: 'active', limit: 100 })
      .then((res) => setOptionTypes(res.optionTypes))
      .catch(() => {})
      .finally(() => setLoadingOptionTypes(false));
  }, [open, initialOptionTypes]);

  // Fetch full OptionType details (with values) when optionTypeId changes
  useEffect(() => {
    if (!open || !watchedOptionTypeId) {
      setSelectedOptionType(null);
      return;
    }
    // Check if already in loaded optionTypes with values
    const cached = optionTypes.find((ot) => ot.id === watchedOptionTypeId);
    if (cached && cached.values && cached.values.length > 0) {
      setSelectedOptionType(cached);
      return;
    }

    setLoadingOptionTypeDetails(true);
    getOptionType(watchedOptionTypeId)
      .then((ot) => {
        setSelectedOptionType(ot);
      })
      .catch(() => {
        setSelectedOptionType(null);
      })
      .finally(() => {
        setLoadingOptionTypeDetails(false);
      });
  }, [open, watchedOptionTypeId, optionTypes]);

  // Reset form and items on open / valueSet change
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setSelectedValueIdToAdd('');
    setItemActionInProgress(null);
    setCurrentValueSet(valueSet);

    if (valueSet && (mode === 'edit' || mode === 'view')) {
      reset({
        name: valueSet.name,
        optionTypeId: valueSet.optionTypeId,
      });
      setItems([...valueSet.items].sort((a, b) => a.position - b.position));
    } else {
      reset(EMPTY);
      setItems([]);
    }
  }, [open, mode, valueSet, reset]);

  // Clear staged items if option type is changed during create mode
  const prevOptionTypeIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!open) {
      prevOptionTypeIdRef.current = undefined;
      return;
    }
    if (mode === 'create') {
      if (
        prevOptionTypeIdRef.current !== undefined &&
        prevOptionTypeIdRef.current !== watchedOptionTypeId
      ) {
        setItems([]);
        setSelectedValueIdToAdd('');
      }
      prevOptionTypeIdRef.current = watchedOptionTypeId;
    }
  }, [open, mode, watchedOptionTypeId]);

  // Filter available values from selectedOptionType that are not yet in `items`
  const availableOptionValues = useMemo(() => {
    if (!selectedOptionType?.values) return [];
    const usedIds = new Set(items.map((i) => i.optionValueId));
    return selectedOptionType.values.filter((v) => v.status === 'active' && !usedIds.has(v.id));
  }, [selectedOptionType, items]);

  // Handle adding a value item
  const handleAddItem = useCallback(async () => {
    if (!selectedValueIdToAdd || !selectedOptionType) return;
    const optionVal = selectedOptionType.values.find((v) => v.id === selectedValueIdToAdd);
    if (!optionVal) return;

    if (mode === 'create') {
      const newItem: ValueSetItem = {
        optionValueId: optionVal.id,
        optionTypeId: selectedOptionType.id,
        code: optionVal.code,
        label: optionVal.label,
        position: items.length,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedValueIdToAdd('');
      return;
    }

    if (!currentValueSet) return;
    setItemActionInProgress('add');
    try {
      const updated = await addValueSetItem(currentValueSet.id, {
        optionValueId: optionVal.id,
        position: items.length,
      });
      setCurrentValueSet(updated);
      setItems(updated.items);
      setSelectedValueIdToAdd('');
      onValuesChanged?.(updated);
    } catch (e) {
      setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setItemActionInProgress(null);
    }
  }, [
    selectedValueIdToAdd,
    selectedOptionType,
    mode,
    items.length,
    currentValueSet,
    onValuesChanged,
    t,
  ]);

  // Handle removing an item
  const handleRemoveItem = useCallback(
    async (optionValueId: string) => {
      if (mode === 'create') {
        setItems((prev) =>
          prev
            .filter((i) => i.optionValueId !== optionValueId)
            .map((item, idx) => ({ ...item, position: idx })),
        );
        return;
      }

      if (!currentValueSet) return;
      setItemActionInProgress(`remove-${optionValueId}`);
      try {
        await removeValueSetItem(currentValueSet.id, optionValueId);
        const refreshed = await getValueSet(currentValueSet.id);
        setCurrentValueSet(refreshed);
        setItems(refreshed.items);
        onValuesChanged?.(refreshed);
      } catch (e) {
        setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      } finally {
        setItemActionInProgress(null);
      }
    },
    [mode, currentValueSet, onValuesChanged, t],
  );

  // Handle reordering an item up or down
  const handleMoveItem = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      const reordered = [...items];
      const movedItem = reordered[index]!;
      const targetItem = reordered[targetIndex]!;
      reordered[index] = targetItem;
      reordered[targetIndex] = movedItem;
      const normalized = reordered.map((item, idx) => ({ ...item, position: idx }));

      if (mode === 'create') {
        setItems(normalized);
        return;
      }

      if (!currentValueSet) return;
      setItemActionInProgress(`move-${index}`);
      try {
        const updated = await reorderValueSetItems(currentValueSet.id, {
          orderedOptionValueIds: normalized.map((i) => i.optionValueId),
        });
        setCurrentValueSet(updated);
        setItems(updated.items);
        onValuesChanged?.(updated);
      } catch (e) {
        setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      } finally {
        setItemActionInProgress(null);
      }
    },
    [items, mode, currentValueSet, onValuesChanged, t],
  );

  // Form submission
  async function onSubmit(v: FormValues): Promise<void> {
    if (mode === 'view') {
      onOpenChange(false);
      return;
    }

    setFormError(null);
    clearErrors();

    try {
      if (mode === 'create') {
        const created = await createValueSet({
          name: v.name,
          optionTypeId: v.optionTypeId,
          items: items.map((i, idx) => ({
            optionValueId: i.optionValueId,
            position: idx,
          })),
        });
        onSaved?.('created', created);
        onOpenChange(false);
      } else if (mode === 'edit' && currentValueSet) {
        if (dirtyFields.name) {
          const updated = await updateValueSet(currentValueSet.id, {
            name: v.name,
            expectedUpdatedAt: currentValueSet.updatedAt,
          });
          onSaved?.('updated', updated);
        }
        onOpenChange(false);
      }
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      if (code === 'CONFLICT' && onConflict) {
        onConflict();
        return;
      }
      const field = code ? FIELD_FOR_CODE[code] : undefined;
      if (field) {
        setError(field, { type: 'server', message: catalogErrorKey(code) }, { shouldFocus: true });
      } else {
        setFormError(t(catalogErrorKey(code)));
      }
    }
  }

  const modalTitle =
    mode === 'create'
      ? t('valueSets.form.createTitle')
      : mode === 'edit'
        ? t('valueSets.form.editTitle')
        : t('valueSets.form.viewTitle');

  const isReadOnly = mode === 'view';

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={modalTitle}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={t('valueSets.form.save')}
      readOnly={isReadOnly}
      dirty={isDirty || (mode === 'create' && items.length > 0)}
      size="lg"
      secondaryAction={
        mode === 'edit' && currentValueSet && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              onOpenChange(false);
              onDelete(currentValueSet);
            }}
          >
            {t('valueSets.delete')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {formError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}

        {/* Name Field */}
        <Field
          label={t('valueSets.form.name')}
          htmlFor="value-set-name"
          error={errors.name?.message ? t(errors.name.message) : undefined}
        >
          <Input
            id="value-set-name"
            {...register('name')}
            placeholder={t('valueSets.form.namePlaceholder')}
            disabled={isReadOnly || isSubmitting}
            autoFocus={mode === 'create'}
          />
        </Field>

        {/* Option Type Field */}
        <Field
          label={t('valueSets.form.optionType')}
          htmlFor="value-set-option-type"
          error={errors.optionTypeId?.message ? t(errors.optionTypeId.message) : undefined}
          hint={mode === 'edit' ? t('valueSets.form.optionTypeLockedHint') : undefined}
        >
          {mode === 'create' ? (
            <select
              id="value-set-option-type"
              {...register('optionTypeId')}
              disabled={loadingOptionTypes || isSubmitting}
              className={cn(selectCls, 'truncate')}
            >
              <option value="">{t('valueSets.form.selectOptionType')}</option>
              {optionTypes.map((ot) => {
                const label = `${ot.name['en'] ?? ot.code} (${ot.code})`;
                return (
                  <option key={ot.id} value={ot.id} title={label}>
                    {capForMessage(label, 48)}
                  </option>
                );
              })}
            </select>
          ) : (
            <>
              <input type="hidden" {...register('optionTypeId')} />
              <div
                className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground"
                title={`${selectedOptionType ? (selectedOptionType.name['en'] ?? selectedOptionType.code) : ''}${selectedOptionType ? ` (${selectedOptionType.code})` : ''}`}
              >
                <span className="truncate font-medium">
                  {selectedOptionType
                    ? (selectedOptionType.name['en'] ?? selectedOptionType.code)
                    : ''}
                </span>
                {selectedOptionType && (
                  <span className="ml-1.5 shrink-0 font-mono text-xs text-muted-foreground">
                    ({selectedOptionType.code})
                  </span>
                )}
              </div>
            </>
          )}
        </Field>

        {/* Values Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">{t('valueSets.form.values')}</h4>
            <span className="text-xs text-muted-foreground">
              {items.length} {t('valueSets.cols.items').toLowerCase()}
            </span>
          </div>

          {/* Add Value Controls (only if not read-only and an option type is selected) */}
          {!isReadOnly && watchedOptionTypeId && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <select
                  id="value-set-select-value"
                  aria-label={t('valueSets.form.selectValue')}
                  value={selectedValueIdToAdd}
                  onChange={(e) => setSelectedValueIdToAdd(e.target.value)}
                  disabled={
                    loadingOptionTypeDetails ||
                    availableOptionValues.length === 0 ||
                    itemActionInProgress !== null
                  }
                  className={cn(selectCls, 'min-w-0 flex-1 truncate')}
                >
                  <option value="">
                    {availableOptionValues.length === 0
                      ? t('valueSets.form.allValuesAdded')
                      : t('valueSets.form.selectValue')}
                  </option>
                  {availableOptionValues.map((v) => {
                    const label = `${v.label['en'] ?? v.code} (${v.code})`;
                    return (
                      <option key={v.id} value={v.id} title={label}>
                        {capForMessage(label, 48)}
                      </option>
                    );
                  })}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    !selectedValueIdToAdd ||
                    loadingOptionTypeDetails ||
                    itemActionInProgress !== null
                  }
                  onClick={handleAddItem}
                  className="shrink-0"
                >
                  {itemActionInProgress === 'add' ? (
                    <Spinner className="mr-1 size-3.5" />
                  ) : (
                    <Plus className="mr-1 size-3.5" />
                  )}
                  {t('valueSets.form.addValue')}
                </Button>
              </div>
            </div>
          )}

          {/* Empty Values State & Warning Banner */}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('valueSets.form.emptyValues')}</p>
              {watchedOptionTypeId && (
                <div className="mt-2.5 flex items-center justify-center gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  <span>{t('valueSets.form.emptyValuesWarning')}</span>
                </div>
              )}
            </div>
          )}

          {/* Values List */}
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {items.map((item, idx) => {
                const label = item.label['en'] ?? item.code;
                const optVal = selectedOptionType?.values.find((v) => v.id === item.optionValueId);
                const swatchHex = optVal?.swatchHex;
                const isRemoving = itemActionInProgress === `remove-${item.optionValueId}`;

                return (
                  <li
                    key={item.optionValueId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-mono text-muted-foreground">
                        {idx + 1}
                      </span>
                      {swatchHex && (
                        <span
                          className="size-3.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: swatchHex }}
                          title={swatchHex}
                          aria-hidden
                        />
                      )}
                      <span
                        className="max-w-[140px] truncate font-medium text-foreground sm:max-w-[200px]"
                        title={label}
                      >
                        {label}
                      </span>
                      <span
                        className="max-w-[100px] truncate font-mono text-xs text-muted-foreground sm:max-w-[140px]"
                        title={item.code}
                      >
                        ({item.code})
                      </span>
                    </div>

                    {!isReadOnly && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0 || itemActionInProgress !== null}
                          onClick={() => handleMoveItem(idx, 'up')}
                          aria-label={t('valueSets.form.moveUp')}
                          title={t('valueSets.form.moveUp')}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === items.length - 1 || itemActionInProgress !== null}
                          onClick={() => handleMoveItem(idx, 'down')}
                          aria-label={t('valueSets.form.moveDown')}
                          title={t('valueSets.form.moveDown')}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={itemActionInProgress !== null}
                          onClick={() => handleRemoveItem(item.optionValueId)}
                          aria-label={t('valueSets.form.remove')}
                          title={t('valueSets.form.remove')}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
                        >
                          {isRemoving ? (
                            <Spinner className="size-4" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </FormModal>
  );
}
