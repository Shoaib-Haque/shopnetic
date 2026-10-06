'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionDataType, OptionStatus, OptionType, OptionValue } from '@shopnetic/contracts';
import { Field, Input, notify, Spinner, StatusBadge, Switch } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { slugify, slugifyLive } from '@/lib/slugify';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import {
  addOptionValue,
  createOptionType,
  removeOptionValue,
  updateOptionType,
  updateOptionValue,
} from './api';

const DATA_TYPES: OptionDataType[] = ['select', 'text', 'number', 'bool', 'swatch'];

/** zod messages are translation keys under the `catalog` namespace, resolved at render. */
const formSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'optionTypes.form.err.required')
    .max(60, 'optionTypes.form.err.codeLong')
    .refine((s) => /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(s), 'optionTypes.form.err.codeFormat'),
  name: z
    .string()
    .trim()
    .min(1, 'optionTypes.form.err.required')
    .max(120, 'optionTypes.form.err.nameLong'),
  dataType: z.enum(['select', 'text', 'number', 'bool', 'swatch']),
  hasSwatch: z.boolean(),
  status: z.enum(['active', 'deprecated']),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  code: '',
  name: '',
  dataType: 'select',
  hasSwatch: false,
  status: 'active',
};

/** API error code → the form field it belongs under. */
const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  OPTION_TYPE_CODE_TAKEN: 'code',
  OPTION_TYPE_NAME_TAKEN: 'name',
};

/** collapse whitespace runs (incl. pasted newlines / tabs) to single spaces. */
const collapseWs = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A value the create form is staging before the option type itself exists
 * — no id/status/etc. yet, just what `optionValueInputSchema` needs. */
interface DraftValue {
  code: string;
  labelEn: string;
  swatchHex: string;
}

export function OptionTypeFormModal({
  open,
  onOpenChange,
  mode,
  optionType,
  onSaved,
  onDelete,
  onValuesChanged,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  optionType?: OptionType | undefined;
  onSaved: (action: 'created' | 'updated', ot: OptionType) => void;
  /** Edit mode only — close the modal, then run the list's delete flow. */
  onDelete?: (ot: OptionType) => void;
  /** Edit mode only — a value was added/removed/status-changed outside the
   * main Save flow (its own endpoints, same reasoning Brand's aliases
   * already established), so the list's row (value count) needs its own
   * way to hear about it. */
  onValuesChanged?: (ot: OptionType) => void;
  /** Edit mode only — the save hit `CONFLICT`. No `expectedUpdatedAt` guard
   * exists on this entity's `update()` yet (unlike Category/Brand) — kept
   * for API-shape parity in case a future request 409s for another reason. */
  onConflict?: () => void;
}) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  // Values aren't part of the PATCH body — they're their own endpoints, so
  // they're tracked and mutated separately from the RHF form below, with
  // their own local optimistic list (seeded from `optionType` each time the
  // modal opens, same pattern Brand's aliases already established).
  const [values, setValues] = useState<OptionType['values']>([]);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newSwatch, setNewSwatch] = useState('#888888');
  const [addingValue, setAddingValue] = useState(false);
  const [removingValueId, setRemovingValueId] = useState<string | null>(null);
  const [togglingValueId, setTogglingValueId] = useState<string | null>(null);
  const [movingValueId, setMovingValueId] = useState<string | null>(null);
  // create mode only — values are part of the create request itself, so
  // they're staged locally until submit rather than round-tripping through
  // the (not-yet-existing) option type's value endpoints.
  const [draftValues, setDraftValues] = useState<DraftValue[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    watch,
    control,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: EMPTY,
  });

  const fieldError = (name: Path<FormValues>): string | undefined => {
    const msg = errors[name]?.message;
    return msg ? t(msg) : undefined;
  };

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setValueError(null);
    setNewCode('');
    setNewLabel('');
    setNewSwatch('#888888');
    setDraftValues([]);
    if (mode === 'edit' && optionType) {
      reset({
        code: optionType.code,
        name: optionType.name['en'] ?? '',
        dataType: optionType.dataType,
        hasSwatch: optionType.hasSwatch,
        status: optionType.status,
      });
      setValues(optionType.values);
    } else {
      reset(EMPTY);
      setValues([]);
    }
  }, [open, mode, optionType, reset]);

  const hasSwatch = watch('hasSwatch');

  async function onSubmit(v: FormValues): Promise<void> {
    setFormError(null);
    clearErrors();
    try {
      if (mode === 'create') {
        const ot = await createOptionType({
          code: v.code,
          name: { en: v.name },
          dataType: v.dataType,
          hasSwatch: v.hasSwatch,
          ...(draftValues.length
            ? {
                values: draftValues.map((d) => ({
                  code: d.code,
                  label: { en: d.labelEn },
                  ...(v.hasSwatch && d.swatchHex ? { swatchHex: d.swatchHex } : {}),
                })),
              }
            : {}),
        });
        onSaved('created', ot);
      } else if (optionType) {
        const d = dirtyFields;
        if (Object.keys(d).length) {
          const ot = await updateOptionType(optionType.id, {
            ...(d.code ? { code: v.code } : {}),
            ...(d.name ? { name: { en: v.name } } : {}),
            ...(d.dataType ? { dataType: v.dataType } : {}),
            ...(d.hasSwatch ? { hasSwatch: v.hasSwatch } : {}),
            ...(d.status ? { status: v.status } : {}),
            // guard against clobbering another admin's edit made since this
            // form opened — mirrors Category's/Brand's own field
            expectedUpdatedAt: optionType.updatedAt,
          });
          onSaved('updated', ot);
        }
      }
      onOpenChange(false);
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      if (code === 'CONFLICT' && onConflict) {
        onConflict(); // list owner closes this modal, refetches, and notifies
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

  async function onAddValue(): Promise<void> {
    const code = slugify(newCode, 60);
    const labelEn = collapseWs(newLabel);
    if (!code || !labelEn) return;
    if (addingValue) return;

    if (mode === 'create') {
      if (draftValues.some((d) => d.code === code)) {
        setValueError(t(catalogErrorKey('OPTION_VALUE_CODE_TAKEN')));
        return;
      }
      if (draftValues.some((d) => d.labelEn.toLowerCase() === labelEn.toLowerCase())) {
        setValueError(t(catalogErrorKey('OPTION_VALUE_LABEL_TAKEN')));
        return;
      }
      setDraftValues((prev) => [...prev, { code, labelEn, swatchHex: newSwatch }]);
      setNewCode('');
      setNewLabel('');
      setValueError(null);
      return;
    }
    if (!optionType) return;
    setAddingValue(true);
    setValueError(null);
    try {
      const ot = await addOptionValue(optionType.id, {
        code,
        label: { en: labelEn },
        ...(hasSwatch ? { swatchHex: newSwatch } : {}),
      });
      setValues(ot.values);
      setNewCode('');
      setNewLabel('');
      notify.saved(t('optionTypes.toast.valueAdded', { label: labelEn }));
      onValuesChanged?.(ot);
    } catch (e) {
      // a duplicate code/label is the user's typo, not a background
      // failure — inline under the field, same as Brand's alias error
      setValueError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setAddingValue(false);
    }
  }

  async function onRemoveValue(value: OptionValue): Promise<void> {
    if (mode !== 'edit' || !optionType) return;
    setRemovingValueId(value.id);
    try {
      await removeOptionValue(optionType.id, value.id);
      const next = values.filter((v) => v.id !== value.id);
      setValues(next);
      notify.saved(t('optionTypes.toast.valueRemoved', { label: value.label['en'] ?? value.code }));
      onValuesChanged?.({ ...optionType, values: next });
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setRemovingValueId(null);
    }
  }

  async function onToggleValueStatus(value: OptionValue): Promise<void> {
    if (mode !== 'edit' || !optionType) return;
    const nextStatus: OptionStatus = value.status === 'active' ? 'deprecated' : 'active';
    setTogglingValueId(value.id);
    try {
      const ot = await updateOptionValue(optionType.id, value.id, { status: nextStatus });
      setValues(ot.values);
      notify.saved(t('optionTypes.toast.valueUpdated', { label: value.label['en'] ?? value.code }));
      onValuesChanged?.(ot);
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setTogglingValueId(null);
    }
  }

  /** Create mode only — `position` isn't a field on the draft yet (it's
   * derived from array order at submit time, `option-type.service.ts`'s own
   * `create()`), so reordering here is a plain local array swap, no API
   * call. */
  function moveDraftValue(index: number, direction: 'up' | 'down'): void {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= draftValues.length) return;
    setDraftValues((prev) => {
      const next = [...prev];
      const [a, b] = [next[index]!, next[swapIndex]!];
      next[index] = b;
      next[swapIndex] = a;
      return next;
    });
  }

  /** Edit mode — `position` is real, server-stored (`plan/26` section 2.1:
   * drives the PDP option-picker's display order), so reordering swaps it
   * between the two affected values via two sequential `updateOptionValue`
   * calls. The two calls' own `values` snapshots would each reflect only
   * one side of the swap mid-flight — only the second (final) response is
   * applied to state, to avoid a flash of a half-swapped order. */
  async function onMoveValue(value: OptionValue, direction: 'up' | 'down'): Promise<void> {
    if (mode !== 'edit' || !optionType) return;
    const index = values.findIndex((v) => v.id === value.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= values.length) return;
    const other = values[swapIndex]!;
    setMovingValueId(value.id);
    try {
      await updateOptionValue(optionType.id, value.id, { position: other.position });
      const ot = await updateOptionValue(optionType.id, other.id, { position: value.position });
      setValues(ot.values);
      onValuesChanged?.(ot);
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setMovingValueId(null);
    }
  }

  const selectCls =
    'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]';

  const codeField = register('code');
  const nameField = register('name');

  const secondaryAction =
    mode === 'edit' && optionType && onDelete ? (
      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          onDelete(optionType);
        }}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        {t('optionTypes.delete')}
      </button>
    ) : undefined;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={t(mode === 'create' ? 'optionTypes.form.createTitle' : 'optionTypes.form.editTitle')}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={t('optionTypes.form.save')}
      {...(secondaryAction ? { secondaryAction } : {})}
      dirty={isDirty}
    >
      <Field
        label={t('optionTypes.form.code')}
        htmlFor="option-type-code"
        hint={t('optionTypes.form.codeHint')}
        error={fieldError('code')}
      >
        <Input
          id="option-type-code"
          maxLength={60}
          invalid={Boolean(errors.code)}
          {...codeField}
          onChange={(e) => {
            e.currentTarget.value = slugifyLive(e.currentTarget.value, 60);
            void codeField.onChange(e);
          }}
          onBlur={(e) => {
            e.currentTarget.value = slugify(e.currentTarget.value, 60);
            void codeField.onChange(e);
            void codeField.onBlur(e);
          }}
        />
      </Field>

      <Field
        label={t('optionTypes.form.name')}
        htmlFor="option-type-name"
        error={fieldError('name')}
      >
        <Input
          id="option-type-name"
          maxLength={120}
          invalid={Boolean(errors.name)}
          {...nameField}
          onBlur={(e) => {
            e.currentTarget.value = collapseWs(e.currentTarget.value);
            void nameField.onChange(e);
            void nameField.onBlur(e);
          }}
        />
      </Field>

      <Field label={t('optionTypes.form.dataType')} htmlFor="option-type-data-type">
        <select id="option-type-data-type" className={selectCls} {...register('dataType')}>
          {DATA_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {t(`optionTypes.dataType.${dt}`)}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <Controller
          name="hasSwatch"
          control={control}
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              className="mt-0.5"
              wrappedInLabel
            />
          )}
        />
        <span>
          {t('optionTypes.form.hasSwatch')}
          <span className="block text-xs font-normal text-muted-foreground">
            {t('optionTypes.form.hasSwatchHint')}
          </span>
        </span>
      </label>

      {mode === 'edit' && (
        <Field label={t('optionTypes.form.status')} htmlFor="option-type-status">
          <select id="option-type-status" className={selectCls} {...register('status')}>
            <option value="active">{t('optionTypes.status.active')}</option>
            <option value="deprecated">{t('optionTypes.status.deprecated')}</option>
          </select>
        </Field>
      )}

      <Field label={t('optionTypes.form.values')} hint={t('optionTypes.form.valuesHint')}>
        <div className="flex flex-col gap-1.5">
          {(mode === 'create' ? draftValues : values).length === 0 && (
            <p className="text-xs text-muted-foreground">{t('optionTypes.form.noValues')}</p>
          )}
          {mode === 'create'
            ? draftValues.map((d, i) => (
                <div
                  key={d.code}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                >
                  {hasSwatch && (
                    <span
                      className="size-3.5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: d.swatchHex }}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={d.labelEn}>
                    {d.labelEn}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.code}</span>
                  <button
                    type="button"
                    aria-label={t('optionTypes.form.moveUp')}
                    disabled={i === 0}
                    onClick={() => moveDraftValue(i, 'up')}
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t('optionTypes.form.moveDown')}
                    disabled={i === draftValues.length - 1}
                    onClick={() => moveDraftValue(i, 'down')}
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t('optionTypes.form.remove')}
                    onClick={() => setDraftValues((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))
            : values.map((v, i) => {
                const removing = removingValueId === v.id;
                const toggling = togglingValueId === v.id;
                const moving = movingValueId === v.id;
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    {optionType?.hasSwatch && v.swatchHex && (
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: v.swatchHex }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate" title={v.label['en'] ?? v.code}>
                      {v.label['en'] ?? v.code}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{v.code}</span>
                    <button
                      type="button"
                      aria-label={t('optionTypes.form.moveUp')}
                      disabled={i === 0 || moving}
                      onClick={() => void onMoveValue(v, 'up')}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t('optionTypes.form.moveDown')}
                      disabled={i === values.length - 1 || moving}
                      onClick={() => void onMoveValue(v, 'down')}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={toggling}
                      onClick={() => void onToggleValueStatus(v)}
                      className="shrink-0 disabled:opacity-50"
                    >
                      <StatusBadge tone={v.status === 'active' ? 'success' : 'neutral'}>
                        {t(`optionTypes.status.${v.status}`)}
                      </StatusBadge>
                    </button>
                    <button
                      type="button"
                      aria-label={t('optionTypes.form.remove')}
                      disabled={removing}
                      onClick={() => void onRemoveValue(v)}
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      {removing ? <Spinner className="size-3" /> : '×'}
                    </button>
                  </div>
                );
              })}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-2">
          <Input
            value={newCode}
            onChange={(e) => {
              setNewCode(e.target.value);
              setValueError(null);
            }}
            placeholder={t('optionTypes.form.addValueCode')}
            disabled={addingValue}
            className="w-28"
          />
          <Input
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
              setValueError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onAddValue();
              }
            }}
            placeholder={t('optionTypes.form.addValueLabel')}
            disabled={addingValue}
            invalid={valueError !== null}
            className="min-w-0 flex-1"
          />
          {hasSwatch && (
            <input
              type="color"
              value={newSwatch}
              onChange={(e) => setNewSwatch(e.target.value)}
              aria-label={t('optionTypes.form.addValueSwatch')}
              disabled={addingValue}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-input"
            />
          )}
          <button
            type="button"
            onClick={() => void onAddValue()}
            disabled={addingValue || !newCode.trim() || !newLabel.trim()}
            className="shrink-0 rounded-md border border-input px-3 text-sm font-medium disabled:opacity-50"
          >
            {addingValue ? <Spinner className="size-4" /> : t('optionTypes.form.add')}
          </button>
        </div>
        {valueError !== null && <p className="mt-1 text-xs text-destructive">{valueError}</p>}
      </Field>

      {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
    </FormModal>
  );
}
