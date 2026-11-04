'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Edit2,
  Grid,
  Image as ImageIcon,
  Layers,
  Plus,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  computeComboSignature,
  VARIANT_BULK_GENERATE_MAX,
  VARIANT_DIM_MAX_MM,
  VARIANT_SKU_MAX,
  VARIANT_WEIGHT_MAX_G,
  type CategoryOption,
  type CreateVariantRequest,
  type OptionType,
  type Product,
  type ProductOption,
  type UpdateVariantRequest,
  type Variant,
  type VariantSelection,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { integerKeyDownHandler, integerPasteHandler } from '@/lib/numeric-input';
import { listCategoryOptions } from '@/features/catalog/categories/api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
import { useSoftDeleteWithUndo } from '@/components/crud/use-soft-delete-with-undo';
import { matchScore, tokenize } from '@/lib/search';
import {
  countVariantOffers,
  createVariant,
  deleteVariant,
  listProductOptions,
  listVariantsPage,
  restoreVariant,
  updateVariant,
} from './api';

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

// ── Variant Selection Resolution Helpers ─────────────────────────────────────

export interface ResolvedVariantSelection {
  optionTypeId: string;
  optionValueId: string;
  typeName: string;
  valLabel: string;
  formatted: string;
}

export function resolveVariantSelections(
  selections: VariantSelection[] | undefined,
  optionTypeMap: Map<string, OptionType>,
  productOptions: ProductOption[],
): ResolvedVariantSelection[] {
  if (!selections || selections.length === 0) return [];
  return selections.map((sel) => {
    const ot = optionTypeMap.get(sel.optionTypeId);
    const ov = ot?.values.find((v) => v.id === sel.optionValueId);
    const po = productOptions.find((p) => p.optionTypeId === sel.optionTypeId);
    const pv = po?.values.find((v) => v.optionValueId === sel.optionValueId);

    const typeName =
      sel.optionTypeName?.en ||
      sel.optionTypeCode ||
      ot?.name.en ||
      po?.optionTypeName?.en ||
      po?.optionTypeCode ||
      'Option';
    const valLabel =
      sel.optionValueLabel?.en ||
      sel.optionValueCode ||
      ov?.label.en ||
      ov?.code ||
      pv?.code ||
      '—';

    return {
      optionTypeId: sel.optionTypeId,
      optionValueId: sel.optionValueId,
      typeName,
      valLabel,
      formatted: valLabel !== '—' ? `${typeName}: ${valLabel}` : typeName,
    };
  });
}

export function formatVariantSelectionsLabel(
  variant: Variant | null | undefined,
  optionTypeMap: Map<string, OptionType>,
  productOptions: ProductOption[],
  fallback = 'Single / Base Variant',
): string {
  if (!variant) return '';
  if (variant.skuCode) return variant.skuCode;
  const resolved = resolveVariantSelections(variant.selections, optionTypeMap, productOptions);
  if (resolved.length === 0) return fallback;
  return resolved.map((r) => r.formatted).join(', ');
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
  const [comboSearch, setComboSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [prefixError, setPrefixError] = useState<string | null>(null);

  const categoryOptionMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const co of categoryOptions) map.set(co.optionTypeId, co);
    return map;
  }, [categoryOptions]);

  // Variant axes only
  const variantAxes = useMemo(() => {
    return productOptions.filter((po) => {
      const co = categoryOptionMap.get(po.optionTypeId);
      if (co) return co.isVariantAxis === true;
      return categoryOptions.length === 0;
    });
  }, [productOptions, categoryOptionMap, categoryOptions.length]);

  const emptyAxes = useMemo(() => {
    return variantAxes.filter((axis) => axis.values.length === 0);
  }, [variantAxes]);

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
      const sig = computeComboSignature(sel);
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

  const filteredNewCombos = useMemo(() => {
    const tokens = tokenize(comboSearch);
    if (tokens.length === 0) return newCombos;
    return newCombos
      .map((c) => {
        const text = [
          c.suggestedSku,
          ...c.items.flatMap((it) => [it.valueCode, it.valueLabel, it.typeName]),
        ].join(' ');
        const score = matchScore(text, tokens);
        return { c, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => c);
  }, [newCombos, comboSearch]);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setComboSearch('');
    }
    prevOpenRef.current = open;
  }, [open]);

  // Default select all new combos when modal opens or list changes
  useEffect(() => {
    if (open) {
      setSelectedCombos(new Set(newCombos.map((c) => c.signature)));
      setGenError(null);
      setPrefixError(null);
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

  const selectAll = () => {
    setSelectedCombos((prev) => {
      const next = new Set(prev);
      for (const c of filteredNewCombos) next.add(c.signature);
      return next;
    });
  };

  const deselectAll = () => {
    setSelectedCombos((prev) => {
      const next = new Set(prev);
      for (const c of filteredNewCombos) next.delete(c.signature);
      return next;
    });
  };

  const selectedNewCombos = useMemo(
    () => newCombos.filter((c) => selectedCombos.has(c.signature)),
    [newCombos, selectedCombos],
  );

  const maxSuffixLen = useMemo(
    () => selectedNewCombos.reduce((max, c) => Math.max(max, c.suggestedSku.length), 0),
    [selectedNewCombos],
  );

  const maxAllowedPrefixLength = Math.max(0, VARIANT_SKU_MAX - maxSuffixLen);

  const isPrefixTooLong = skuPrefix.trim().length + maxSuffixLen > VARIANT_SKU_MAX;

  // Re-validate prefix whenever selected combos or maxSuffixLen changes
  useEffect(() => {
    if (!skuPrefix) {
      setPrefixError(null);
      return;
    }
    if (skuPrefix.trim().length + maxSuffixLen > VARIANT_SKU_MAX) {
      setPrefixError(t('products.variants.matrix.errPrefixTooLong', { maxSuffixLen }));
    } else {
      setPrefixError(null);
    }
  }, [maxSuffixLen, skuPrefix, t]);

  const handleGenerate = async () => {
    const toCreate = selectedNewCombos;
    if (toCreate.length === 0) return;

    if (toCreate.length > VARIANT_BULK_GENERATE_MAX) {
      setGenError(t('products.variants.matrix.errMaxCombosExceeded'));
      return;
    }

    const prefix = skuPrefix.trim();
    if (prefix.length + maxSuffixLen > VARIANT_SKU_MAX) {
      setPrefixError(t('products.variants.matrix.errPrefixTooLong', { maxSuffixLen }));
      return;
    }

    setGenerating(true);
    setGenError(null);
    setPrefixError(null);
    const createdList: Variant[] = [];

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
      const errMsg = t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined));
      if (createdList.length > 0) {
        onGenerated(createdList);
        const succeededSignatures = new Set(createdList.map((v) => v.comboSignature));
        setSelectedCombos((prev) => {
          const next = new Set(prev);
          for (const sig of succeededSignatures) {
            next.delete(sig);
          }
          return next;
        });
        setGenError(
          t('products.variants.matrix.errPartialGeneration', {
            created: createdList.length,
            total: toCreate.length,
            error: errMsg,
          }),
        );
      } else {
        setGenError(errMsg);
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
      <ModalContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <ModalHeader className="shrink-0 border-b border-border pb-4">
          <ModalTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" aria-hidden />
            <span>{t('products.variants.matrix.title')}</span>
          </ModalTitle>
          <ModalDescription>{t('products.variants.matrix.description')}</ModalDescription>
        </ModalHeader>

        <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
          {emptyAxes.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span>
                  {t('products.variants.matrix.emptyAxesWarning', {
                    axes: emptyAxes
                      .map((axis) => {
                        const ot = optionTypeMap.get(axis.optionTypeId);
                        return ot?.name.en || axis.optionTypeCode;
                      })
                      .join(', '),
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {t('products.variants.matrix.emptyAxesHint')}
              </p>
            </div>
          )}

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
            <Field
              label={
                <span className="flex items-center justify-between w-full">
                  <span>{t('products.variants.matrix.skuPrefix')}</span>
                  <span
                    className={`text-[11px] tabular-nums font-normal ${
                      isPrefixTooLong
                        ? 'font-medium text-destructive'
                        : skuPrefix.length >= maxAllowedPrefixLength && maxAllowedPrefixLength > 0
                          ? 'font-medium text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {skuPrefix.length}/{maxAllowedPrefixLength}
                  </span>
                </span>
              }
              error={prefixError ?? undefined}
            >
              <Input
                value={skuPrefix}
                maxLength={maxAllowedPrefixLength > 0 ? maxAllowedPrefixLength : undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setSkuPrefix(val);
                  if (val.trim().length + maxSuffixLen > VARIANT_SKU_MAX) {
                    setPrefixError(
                      t('products.variants.matrix.errPrefixTooLong', { maxSuffixLen }),
                    );
                  } else {
                    setPrefixError(null);
                  }
                }}
                placeholder={t('products.variants.matrix.skuPrefixPlaceholder')}
                className="h-9"
              />
            </Field>

            <Field label={t('products.variants.matrix.defaultStatus')}>
              <Select
                value={defaultStatus}
                onValueChange={(v) => setDefaultStatus(v as 'active' | 'inactive')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('products.variants.status.active')}</SelectItem>
                  <SelectItem value="inactive">{t('products.variants.status.inactive')}</SelectItem>
                </SelectContent>
              </Select>
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
                  {t('products.variants.matrix.selectedCount', {
                    selected: selectedCombos.size,
                    total: newCombos.length,
                  })}
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

              <SearchInput
                value={comboSearch}
                onValueChange={setComboSearch}
                placeholder={t('products.variants.matrix.searchCombos')}
                className="h-9"
              />

              {filteredNewCombos.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('products.variants.matrix.noCombosMatch')}
                </div>
              ) : (
                <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-input">
                  {filteredNewCombos.map((combo) => {
                    const isChecked = selectedCombos.has(combo.signature);
                    const previewSku = skuPrefix
                      ? `${skuPrefix}${combo.suggestedSku}`
                      : combo.suggestedSku;
                    return (
                      <label
                        key={combo.signature}
                        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleCombo(combo.signature)}
                          aria-label={combo.suggestedSku || 'Variant'}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {combo.items.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                {t('products.variants.matrix.singleDefaultVariant')}
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
                          {combo.suggestedSku && (
                            <div className="min-w-0">
                              <span
                                className="block min-w-0 truncate font-mono text-xs text-muted-foreground"
                                title={previewSku}
                              >
                                {previewSku}
                              </span>
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {genError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
              {genError}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="shrink-0 border-t border-border pt-3">
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
            disabled={
              generating ||
              selectedCombos.size === 0 ||
              emptyAxes.length > 0 ||
              Boolean(prefixError) ||
              isPrefixTooLong
            }
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
  onConflict?: () => void;
}

const variantFormSchema = z.object({
  skuCode: z
    .string()
    .trim()
    .max(VARIANT_SKU_MAX, 'products.variants.form.err.skuLong')
    .optional()
    .or(z.literal('')),
  gtin: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9]{8,14}$/.test(v), 'products.variants.form.gtinHint')
    .optional()
    .or(z.literal('')),
  weightG: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 0),
      'products.variants.form.err.weightInvalid',
    )
    .refine(
      (v) => v === '' || Number(v) <= VARIANT_WEIGHT_MAX_G,
      'products.variants.form.err.weightMax',
    )
    .optional()
    .or(z.literal('')),
  length: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'products.variants.form.err.dimensionInvalid',
    )
    .refine(
      (v) => v === '' || Number(v) <= VARIANT_DIM_MAX_MM,
      'products.variants.form.err.dimensionMax',
    )
    .optional()
    .or(z.literal('')),
  width: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'products.variants.form.err.dimensionInvalid',
    )
    .refine(
      (v) => v === '' || Number(v) <= VARIANT_DIM_MAX_MM,
      'products.variants.form.err.dimensionMax',
    )
    .optional()
    .or(z.literal('')),
  height: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'products.variants.form.err.dimensionInvalid',
    )
    .refine(
      (v) => v === '' || Number(v) <= VARIANT_DIM_MAX_MM,
      'products.variants.form.err.dimensionMax',
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['active', 'inactive']),
});

type VariantFormValues = z.infer<typeof variantFormSchema>;

interface OptionValueItem {
  id: string;
  code: string;
  label: string;
  swatchHex?: string | null | undefined;
}

interface OptionValueComboboxProps {
  id?: string;
  value: string;
  onChange: (valueId: string) => void;
  values: OptionValueItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

function OptionValueCombobox({
  id,
  value,
  onChange,
  values,
  placeholder = 'Select a value…',
  searchPlaceholder = 'Search values…',
  emptyText = 'No values found',
  ariaLabel,
  disabled = false,
}: OptionValueComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedItem = useMemo(() => values.find((v) => v.id === value), [values, value]);

  const filteredValues = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return values;
    const tokens = tokenize(trimmed, { minLength: 1 });
    if (tokens.length === 0) return values;
    return values
      .map((v) => {
        const code = v.code.toLowerCase();
        const label = v.label.toLowerCase();
        const text = `${code} ${label}`;

        let score = 0;
        if (code === trimmed) {
          score += 100;
        } else if (label === trimmed) {
          score += 80;
        } else if (code.startsWith(trimmed)) {
          score += 50;
        } else if (label.startsWith(trimmed)) {
          score += 30;
        }

        const tokenScore = matchScore(text, tokens);
        score += tokenScore;

        return { v, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ v }) => v);
  }, [values, search]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: filteredValues.length,
    onSelect: (index) => {
      const item = filteredValues[index];
      if (item) {
        onChange(item.id);
        setOpen(false);
        setSearch('');
      }
    },
    onClose: () => setOpen(false),
    resetOn: [filteredValues],
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-center gap-2 truncate text-left">
            {selectedItem?.swatchHex && (
              <span
                className="size-3.5 shrink-0 rounded-full border border-border shadow-xs"
                style={{ backgroundColor: selectedItem.swatchHex }}
                title={selectedItem.swatchHex}
              />
            )}
            <span className={selectedItem ? 'text-foreground' : 'text-muted-foreground'}>
              {selectedItem ? `${selectedItem.label} (${selectedItem.code})` : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] max-w-[24rem] p-2 shadow-lg z-[60]"
        onWheel={(e) => e.stopPropagation()}
      >
        <SearchInput
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleKeyDown}
          placeholder={searchPlaceholder}
          className="mb-2"
          inputClassName="h-8 text-xs"
          autoFocus
        />
        <div
          ref={listboxRef}
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filteredValues.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            filteredValues.map((val, index) => {
              const isSelected = val.id === value;
              const { onMouseEnter, isHighlighted } = getOptionProps(index);
              return (
                <button
                  key={val.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(val.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left ${
                    isSelected
                      ? 'bg-primary text-primary-foreground font-medium'
                      : isHighlighted
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted/70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {val.swatchHex && (
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-border shadow-xs"
                        style={{ backgroundColor: val.swatchHex }}
                        title={val.swatchHex}
                      />
                    )}
                    <span>{val.label}</span>
                    <span
                      className={`font-mono text-[10px] ${
                        isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      ({val.code})
                    </span>
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
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
  onConflict,
}: VariantFormModalProps) {
  const t = useTranslations('catalog');
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isSkuUserEdited = useRef(false);

  const isEdit = variant !== null;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VariantFormValues>({
    resolver: zodResolver(variantFormSchema),
    defaultValues: {
      skuCode: '',
      gtin: '',
      weightG: '',
      length: '',
      width: '',
      height: '',
      status: 'active',
    },
  });

  function fieldError(field: Path<VariantFormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  const categoryOptionMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const co of categoryOptions) map.set(co.optionTypeId, co);
    return map;
  }, [categoryOptions]);

  const variantAxes = useMemo(() => {
    return productOptions.filter((po) => {
      const co = categoryOptionMap.get(po.optionTypeId);
      if (co) return co.isVariantAxis === true;
      return categoryOptions.length === 0;
    });
  }, [productOptions, categoryOptionMap, categoryOptions.length]);

  const suggestedSku = useMemo(() => {
    if (isEdit || variantAxes.length === 0) return '';
    const codes: string[] = [];
    for (const axis of variantAxes) {
      const selectedValId = manualSelections[axis.optionTypeId];
      if (!selectedValId) continue;
      const val = axis.values.find((v) => v.optionValueId === selectedValId);
      if (val?.code) {
        codes.push(val.code.trim().toUpperCase());
      }
    }
    return codes.join('-');
  }, [isEdit, variantAxes, manualSelections]);

  useEffect(() => {
    if (!isEdit && !isSkuUserEdited.current) {
      setValue('skuCode', suggestedSku, {
        shouldValidate: true,
        shouldDirty: Boolean(suggestedSku),
      });
    }
  }, [isEdit, suggestedSku, setValue]);

  useEffect(() => {
    if (variant) {
      const d = variant.dims as { length?: number; width?: number; height?: number } | null;
      reset({
        skuCode: variant.skuCode ?? '',
        gtin: variant.gtin ?? '',
        weightG: variant.weightG != null ? String(variant.weightG) : '',
        length: d?.length != null ? String(d.length) : '',
        width: d?.width != null ? String(d.width) : '',
        height: d?.height != null ? String(d.height) : '',
        status: variant.status,
      });
      setFormError(null);
    } else {
      reset({
        skuCode: '',
        gtin: '',
        weightG: '',
        length: '',
        width: '',
        height: '',
        status: 'active',
      });
      setManualSelections({});
      setFormError(null);
      isSkuUserEdited.current = false;
    }
  }, [variant, open, reset]);

  const onSubmit = async (values: VariantFormValues) => {
    setFormError(null);

    const dimsObj =
      values.length || values.width || values.height
        ? {
            ...(values.length ? { length: Number(values.length) } : {}),
            ...(values.width ? { width: Number(values.width) } : {}),
            ...(values.height ? { height: Number(values.height) } : {}),
          }
        : null;

    try {
      if (isEdit && variant) {
        const req: UpdateVariantRequest = {
          skuCode: values.skuCode?.trim() || null,
          gtin: values.gtin?.trim() || null,
          weightG: values.weightG ? Number(values.weightG) : null,
          dims: dimsObj,
          status: values.status,
          expectedUpdatedAt: variant.updatedAt,
        };
        const updated = await updateVariant(product.id, variant.id, req);
        onSaved(updated);
        notify.saved(t('products.variants.toast.updated'));
        onOpenChange(false);
      } else {
        const selections: VariantSelection[] = variantAxes.map((axis) => ({
          optionTypeId: axis.optionTypeId,
          optionValueId: manualSelections[axis.optionTypeId] ?? '',
        }));

        if (selections.some((s) => !s.optionValueId)) {
          setFormError(t('products.variants.form.selectValues'));
          return;
        }

        const req: CreateVariantRequest = {
          selections,
          skuCode: values.skuCode?.trim() || null,
          gtin: values.gtin?.trim() || null,
          weightG: values.weightG ? Number(values.weightG) : null,
          dims: dimsObj,
          status: values.status,
        };
        const created = await createVariant(product.id, req);
        onSaved(created);
        notify.saved(t('products.variants.toast.created'));
        onOpenChange(false);
      }
    } catch (err) {
      const code = err instanceof AdminApiError ? err.code : undefined;
      if (code === 'VARIANT_SKU_TAKEN' || code === 'SKU_TAKEN') {
        setError('skuCode', { type: 'server', message: t(catalogErrorKey(code)) });
      } else if (code === 'CONFLICT' || code === 'VARIANT_OCC_CONFLICT') {
        setFormError(t('products.variants.form.err.conflict'));
        onConflict?.();
      } else {
        setFormError(t(catalogErrorKey(code)));
      }
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg max-h-[85vh] flex flex-col">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <ModalHeader className="shrink-0 border-b border-border pb-4">
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

          <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
            {formError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                {formError}
              </div>
            )}

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
                    resolveVariantSelections(variant.selections, optionTypeMap, productOptions).map(
                      (sel) => (
                        <span
                          key={sel.optionTypeId}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {sel.typeName}: {sel.valLabel}
                        </span>
                      ),
                    )
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
                  const fieldId = `manual-axis-${axis.optionTypeId}`;
                  const valuesList: OptionValueItem[] = axis.values.map((v) => {
                    const valObj = ot?.values.find((val) => val.id === v.optionValueId);
                    return {
                      id: v.optionValueId,
                      code: v.code,
                      label: valObj?.label.en ?? v.code,
                      swatchHex: valObj?.swatchHex ?? null,
                    };
                  });
                  return (
                    <Field key={axis.optionTypeId} label={name} htmlFor={fieldId}>
                      <OptionValueCombobox
                        id={fieldId}
                        value={manualSelections[axis.optionTypeId] ?? ''}
                        onChange={(v) =>
                          setManualSelections((prev) => ({
                            ...prev,
                            [axis.optionTypeId]: v,
                          }))
                        }
                        values={valuesList}
                        placeholder={t('products.variants.form.selectValues')}
                        ariaLabel={name}
                      />
                    </Field>
                  );
                })}
              </div>
            ) : null}

            {/* SKU and GTIN */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label={t('products.variants.form.sku')}
                htmlFor="variant-sku"
                hint={
                  !isEdit && suggestedSku && isSkuUserEdited.current
                    ? t('products.variants.form.suggestedSkuHint', { sku: suggestedSku })
                    : undefined
                }
                error={fieldError('skuCode')}
              >
                <Input
                  id="variant-sku"
                  {...register('skuCode', {
                    onChange: () => {
                      isSkuUserEdited.current = true;
                    },
                  })}
                  placeholder={suggestedSku || t('products.variants.form.skuPlaceholder')}
                  invalid={Boolean(errors.skuCode)}
                />
              </Field>

              <Field
                label={t('products.variants.form.gtin')}
                htmlFor="variant-gtin"
                hint={t('products.variants.form.gtinHint')}
                error={fieldError('gtin')}
              >
                <Input
                  id="variant-gtin"
                  {...register('gtin')}
                  placeholder={t('products.variants.form.gtinPlaceholder')}
                  invalid={Boolean(errors.gtin)}
                  onKeyDown={integerKeyDownHandler}
                  onPaste={(e) =>
                    integerPasteHandler(e, (val) =>
                      setValue('gtin', val, { shouldValidate: true, shouldDirty: true }),
                    )
                  }
                />
              </Field>
            </div>

            {/* Weight and Dimensions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label={t('products.variants.form.weightG')}
                htmlFor="variant-weight"
                error={fieldError('weightG')}
              >
                <Input
                  id="variant-weight"
                  type="text"
                  inputMode="numeric"
                  {...register('weightG')}
                  placeholder={t('products.variants.form.weightPlaceholder')}
                  invalid={Boolean(errors.weightG)}
                  onKeyDown={integerKeyDownHandler}
                  onPaste={(e) =>
                    integerPasteHandler(e, (val) =>
                      setValue('weightG', val, { shouldValidate: true, shouldDirty: true }),
                    )
                  }
                />
              </Field>

              <Field
                label={t('products.variants.form.dimensions')}
                error={fieldError('length') || fieldError('width') || fieldError('height')}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="L"
                    aria-label={t('products.variants.form.length')}
                    {...register('length')}
                    invalid={Boolean(errors.length)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('length', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="W"
                    aria-label={t('products.variants.form.width')}
                    {...register('width')}
                    invalid={Boolean(errors.width)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('width', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="H"
                    aria-label={t('products.variants.form.height')}
                    {...register('height')}
                    invalid={Boolean(errors.height)}
                    onKeyDown={integerKeyDownHandler}
                    onPaste={(e) =>
                      integerPasteHandler(e, (val) =>
                        setValue('height', val, { shouldValidate: true, shouldDirty: true }),
                      )
                    }
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
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Switch
                    checked={field.value === 'active'}
                    onCheckedChange={(c) => field.onChange(c ? 'active' : 'inactive')}
                    aria-label={t('products.variants.form.active')}
                  />
                )}
              />
            </div>
          </ModalBody>

          <ModalFooter className="shrink-0 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('products.variants.form.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {isEdit ? t('products.variants.form.save') : t('products.variants.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Cascade Delete Variant & Offers Confirmation Modal ──────────────────────

interface CascadeVariantOfferDeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variantLabel: string;
  offerCount: number;
  onConfirm: () => Promise<void>;
  loading: boolean;
}

function CascadeVariantOfferDeleteConfirmModal({
  open,
  onOpenChange,
  variantLabel,
  offerCount,
  onConfirm,
  loading,
}: CascadeVariantOfferDeleteConfirmModalProps) {
  const t = useTranslations('catalog');

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="text-destructive">
            {t('products.variants.cascadeOfferDeleteTitle')}
          </ModalTitle>
          <ModalDescription>
            {t('products.variants.cascadeOfferDeleteMessage', {
              name: variantLabel,
              count: offerCount,
            })}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {t('products.variants.form.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={loading} onClick={onConfirm}>
            {loading ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
            {t('products.variants.cascadeOfferDeleteConfirm')}
          </Button>
        </ModalFooter>
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
  onManageOffers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onBackToOptions?: (product: Product) => void;
  onManageMedia?: (product: Product) => void;
  onManageOffers?: (product: Product, variantId?: string) => void;
}) {
  const t = useTranslations('catalog');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [totalVariants, setTotalVariants] = useState(0);
  const [unfilteredTotalVariants, setUnfilteredTotalVariants] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);

  // Sub-modals
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [allExistingVariants, setAllExistingVariants] = useState<Variant[]>([]);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    variant: Variant | null;
  }>({ open: false, variant: null });

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cascadeVariantToDelete, setCascadeVariantToDelete] = useState<{
    variant: Variant;
    offerCount: number;
  } | null>(null);
  const [cascadeDeleting, setCascadeDeleting] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!product) return;
      const pId = product.id;
      const cId = product.categoryId;
      if (!background) {
        setLoading(true);
        setLoadError(null);
      }
      setActionError(null);
      try {
        const [varsPage, pOpts, cOpts, otLive, otArch] = await Promise.all([
          listVariantsPage(pId, { q: debouncedQuery, limit: 30 }),
          listProductOptions(pId),
          listCategoryOptions(cId),
          listOptionTypesPage({ limit: 100 }),
          listOptionTypesPage({ archived: true, limit: 100 }).catch(() => ({ optionTypes: [] })),
        ]);
        if (mounted.current && product.id === pId) {
          setVariants(varsPage.variants);
          setTotalVariants(varsPage.total);
          if (!debouncedQuery) {
            setUnfilteredTotalVariants(varsPage.total);
          }
          setNextCursor(varsPage.nextCursor);
          setProductOptions(pOpts);
          setCategoryOptions(cOpts);
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
        if (mounted.current && product.id === pId && !background) {
          setLoading(false);
        }
      }
    },
    [product, debouncedQuery, t],
  );

  useEffect(() => {
    if (!open || !product) {
      setVariants([]);
      setTotalVariants(0);
      setUnfilteredTotalVariants(0);
      setNextCursor(undefined);
      setLoadingMore(false);
      setSearchQuery('');
      setDebouncedQuery('');
      setProductOptions([]);
      setCategoryOptions([]);
      setOptionTypes([]);
      setGeneratorOpen(false);
      setAllExistingVariants([]);
      setFormModalState({ open: false, variant: null });
      setActionError(null);
      setLoadError(null);
      return;
    }
    void loadData();
  }, [open, product, loadData]);

  useEffect(() => {
    if (generatorOpen && product) {
      let active = true;
      const fetchAll = async () => {
        try {
          const collected: Variant[] = [];
          let cur: string | undefined = undefined;
          while (active) {
            const page = await listVariantsPage(product.id, {
              limit: 100,
              ...(cur ? { cursor: cur } : {}),
            });
            collected.push(...page.variants);
            if (!page.nextCursor) break;
            cur = page.nextCursor;
          }
          if (active) setAllExistingVariants(collected);
        } catch {
          if (active) setAllExistingVariants(variants);
        }
      };
      void fetchAll();
      return () => {
        active = false;
      };
    }
    return undefined;
  }, [generatorOpen, product, variants]);

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

  const variantAxes = useMemo(() => {
    return productOptions.filter((po) => {
      const co = categoryOptionMap.get(po.optionTypeId);
      if (co) return co.isVariantAxis === true;
      return categoryOptions.length === 0;
    });
  }, [productOptions, categoryOptionMap, categoryOptions.length]);

  const maxCombos = useMemo(() => {
    if (variantAxes.length === 0) return 1;
    for (const axis of variantAxes) {
      if (axis.values.length === 0) return 0;
    }
    return variantAxes.reduce((acc, axis) => acc * axis.values.length, 1);
  }, [variantAxes]);

  const allCombosGenerated = useMemo(() => {
    if (loading || maxCombos === 0) return false;
    return unfilteredTotalVariants >= maxCombos;
  }, [loading, maxCombos, unfilteredTotalVariants]);

  const labelOfVariant = useCallback(
    (v: Variant | null | undefined): string => {
      return formatVariantSelectionsLabel(v, optionTypeMap, productOptions);
    },
    [optionTypeMap, productOptions],
  );

  const resyncVariants = useCallback(async () => {
    if (!product || !mounted.current) return;
    try {
      const page = await listVariantsPage(product.id, { q: debouncedQuery, limit: 30 });
      if (mounted.current) {
        setVariants(page.variants);
        setTotalVariants(page.total);
        if (!debouncedQuery) {
          setUnfilteredTotalVariants(page.total);
        }
        setNextCursor(page.nextCursor);
      }
      if (debouncedQuery && mounted.current) {
        const unfiltered = await listVariantsPage(product.id, { limit: 1 });
        if (mounted.current) {
          setUnfilteredTotalVariants(unfiltered.total);
        }
      }
    } catch {
      // best-effort silent resync
    }
  }, [product, debouncedQuery]);

  const handleLoadMore = useCallback(async () => {
    if (!product || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listVariantsPage(product.id, {
        q: debouncedQuery,
        cursor: nextCursor,
        limit: 30,
      });
      if (mounted.current) {
        setVariants((prev) => [...prev, ...page.variants]);
        setNextCursor(page.nextCursor);
        setTotalVariants(page.total);
      }
    } catch (e) {
      setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      if (mounted.current) {
        setLoadingMore(false);
      }
    }
  }, [product, nextCursor, loadingMore, debouncedQuery, t]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || loadingMore || loading) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void handleLoadMore();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, loading, handleLoadMore]);

  const { doDelete: doDeleteVariant, dismissUndo: dismissUndoVariant } =
    useSoftDeleteWithUndo<Variant>({
      deleteItem: (variantId) =>
        product ? deleteVariant(product.id, variantId) : Promise.resolve(),
      restoreItem: (variantId) =>
        product ? restoreVariant(product.id, variantId) : Promise.resolve(),
      resync: () => void resyncVariants(),
      onOptimisticRemove: (v) => {
        setVariants((prev) => prev.filter((x) => x.id !== v.id));
        setAllExistingVariants((prev) => prev.filter((x) => x.id !== v.id));
        setTotalVariants((prev) => Math.max(0, prev - 1));
        setUnfilteredTotalVariants((prev) => Math.max(0, prev - 1));
      },
      onOptimisticRestore: (v) => {
        setVariants((prev) => [...prev, v].sort((a, b) => a.position - b.position));
        setAllExistingVariants((prev) => [...prev.filter((x) => x.id !== v.id), v]);
        setTotalVariants((prev) => prev + 1);
        setUnfilteredTotalVariants((prev) => prev + 1);
      },
      labelOf: labelOfVariant,
      onError: (e) =>
        setActionError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined))),
      messages: {
        deleted: (name) => t('products.variants.toast.deletedNamed', { name }),
        restored: (name) => t('products.variants.toast.restoredNamed', { name }),
        alreadyDeleted: (name) => t('products.variants.alreadyDeleted', { name }),
        alreadyRestored: (name) => t('products.variants.alreadyRestored', { name }),
        alreadyGoneOnUndo: () => t('products.variants.alreadyGoneOnUndo'),
        undoLabel: t('products.variants.undo'),
      },
    });

  const handleDeleteVariant = async (variant: Variant) => {
    if (!product) return;
    setDeletingId(variant.id);
    setActionError(null);
    try {
      const offerCount = await countVariantOffers(variant.id).catch(() => 0);
      if (offerCount > 0) {
        setCascadeVariantToDelete({ variant, offerCount });
        return;
      }
      await doDeleteVariant(variant);
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmCascadeDelete = async () => {
    if (!cascadeVariantToDelete || !product) return;
    const { variant } = cascadeVariantToDelete;
    setCascadeDeleting(true);
    setDeletingId(variant.id);
    try {
      await doDeleteVariant(variant);
      setCascadeVariantToDelete(null);
    } finally {
      setCascadeDeleting(false);
      setDeletingId(null);
    }
  };

  const handleGenerated = (newlyCreated: Variant[]) => {
    dismissUndoVariant();
    setVariants((prev) => [...prev, ...newlyCreated]);
    setTotalVariants((prev) => prev + newlyCreated.length);
    setUnfilteredTotalVariants((prev) => prev + newlyCreated.length);
  };

  const handleSaved = (v: Variant) => {
    const isNew = !variants.some((x) => x.id === v.id);
    if (isNew) {
      dismissUndoVariant();
    }
    setVariants((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      return exists ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v];
    });
    setTotalVariants((prev) => (variants.some((x) => x.id === v.id) ? prev : prev + 1));
    if (isNew) {
      setUnfilteredTotalVariants((prev) => prev + 1);
    }
  };

  const formatDims = (dims: unknown): string => {
    if (!dims || typeof dims !== 'object') return '—';
    const d = dims as { length?: number; width?: number; height?: number };
    if (!d.length && !d.width && !d.height) return '—';
    return `${d.length ?? 0}×${d.width ?? 0}×${d.height ?? 0} mm`;
  };

  const isArchived = product?.status === 'archived' || Boolean(product?.archivedAt);
  const isPending = product?.status === 'pending';
  const isReadOnly = isArchived || isPending;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <ModalHeader className="shrink-0 border-b border-border pb-4 pr-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ModalTitle className="flex flex-wrap items-center gap-2">
                  <Layers className="size-5 text-primary shrink-0" aria-hidden />
                  <span>{t('products.variants.dialogTitle')}</span>
                  <StatusBadge tone="neutral" className="text-xs font-mono">
                    {unfilteredTotalVariants}
                  </StatusBadge>
                  {product && (
                    <span
                      className="max-w-xs sm:max-w-sm truncate text-sm font-normal text-muted-foreground"
                      title={product.title?.en ?? product.slug}
                    >
                      — {product.title?.en ?? product.slug}
                    </span>
                  )}
                  {isArchived && (
                    <StatusBadge tone="neutral">{t('products.status.archived')}</StatusBadge>
                  )}
                  {isPending && (
                    <StatusBadge tone="warning">{t('products.status.pending')}</StatusBadge>
                  )}
                </ModalTitle>
                <ModalDescription>
                  {isArchived
                    ? t('products.variants.dialogSubtitleArchived')
                    : isPending
                      ? t('products.variants.dialogSubtitlePending')
                      : t('products.variants.dialogSubtitle')}
                </ModalDescription>
              </div>

              {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGeneratorOpen(true)}
                    disabled={loading || allCombosGenerated}
                    title={
                      allCombosGenerated
                        ? t('products.variants.allCombosGeneratedTooltip')
                        : undefined
                    }
                    className="w-full sm:w-auto"
                  >
                    <Wand2 className="size-4" />
                    {t('products.variants.generate')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setFormModalState({ open: true, variant: null })}
                    disabled={loading || allCombosGenerated}
                    title={
                      allCombosGenerated
                        ? t('products.variants.allCombosGeneratedTooltip')
                        : undefined
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="size-4" />
                    {t('products.variants.createSingle')}
                  </Button>
                </div>
              )}
            </div>
          </ModalHeader>

          <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
            {allCombosGenerated && !loading && (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{t('products.variants.allCombosGenerated')}</span>
              </div>
            )}

            {actionError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {actionError}
              </div>
            )}

            {/* Search Toolbar (Always mounted so focus is never lost on typing!) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <SearchInput
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder={t('products.variants.searchPlaceholder')}
                className="flex-1 max-w-sm h-9"
              />
              <div className="text-xs text-muted-foreground">
                {t('products.variants.showingCount', {
                  count: variants.length,
                  total: totalVariants,
                })}
              </div>
            </div>

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
            ) : variants.length === 0 ? (
              debouncedQuery ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                  <Search className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    No variants match your search
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try adjusting your search terms.
                  </p>
                </div>
              ) : (
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
                    {!isReadOnly && !allCombosGenerated && (
                      <Button type="button" size="sm" onClick={() => setGeneratorOpen(true)}>
                        <Wand2 className="size-4" />
                        {t('products.variants.generate')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto rounded-lg border border-border">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('products.variants.table.combination')}</TableHead>
                        <TableHead className="w-36">{t('products.variants.table.sku')}</TableHead>
                        <TableHead className="w-36">{t('products.variants.table.gtin')}</TableHead>
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
                                  resolveVariantSelections(
                                    v.selections,
                                    optionTypeMap,
                                    productOptions,
                                  ).map((sel) => (
                                    <span
                                      key={sel.optionTypeId}
                                      className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                    >
                                      {sel.typeName}: {sel.valLabel}
                                    </span>
                                  ))
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
                                {onManageOffers && product && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onManageOffers(product, v.id)}
                                        aria-label={t('products.offersAction')}
                                      >
                                        <Boxes className="size-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('products.offersAction')}</TooltipContent>
                                  </Tooltip>
                                )}
                                {!isReadOnly && (
                                  <>
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
                                      onClick={() => handleDeleteVariant(v)}
                                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      aria-label="Delete variant"
                                    >
                                      {isDeleting ? (
                                        <Spinner className="size-3.5" />
                                      ) : (
                                        <Trash2 className="size-3.5" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-3">
                  {variants.map((v) => {
                    const isDeleting = deletingId === v.id;
                    return (
                      <div
                        key={v.id}
                        className="rounded-lg border border-border bg-card p-3.5 space-y-2.5 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 flex-1">
                            {v.selections.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                Single / Base Variant
                              </span>
                            ) : (
                              resolveVariantSelections(
                                v.selections,
                                optionTypeMap,
                                productOptions,
                              ).map((sel) => (
                                <span
                                  key={sel.optionTypeId}
                                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                >
                                  {sel.typeName}: {sel.valLabel}
                                </span>
                              ))
                            )}
                          </div>
                          <StatusBadge tone={v.status === 'active' ? 'success' : 'neutral'}>
                            {v.status}
                          </StatusBadge>
                        </div>

                        <div className="flex items-start justify-between gap-4 text-xs">
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              {t('products.variants.table.sku')}:{' '}
                            </span>
                            <span className="font-mono text-foreground">{v.skuCode || '—'}</span>
                          </div>
                          <div className="text-right space-y-0.5 shrink-0">
                            <div>
                              <span className="text-muted-foreground">
                                {t('products.variants.table.gtin')}:{' '}
                              </span>
                              <span className="font-mono text-foreground">{v.gtin || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                {t('products.variants.table.weight')}:{' '}
                              </span>
                              <span className="text-foreground">
                                {v.weightG != null ? `${v.weightG}g` : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                {t('products.variants.table.dimensions')}:{' '}
                              </span>
                              <span className="text-foreground">{formatDims(v.dims)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/50">
                          {onManageOffers && product && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onManageOffers(product, v.id)}
                              aria-label={t('products.offersAction')}
                            >
                              <Boxes className="size-3.5" />
                            </Button>
                          )}
                          {!isReadOnly && (
                            <>
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
                                onClick={() => handleDeleteVariant(v)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Delete variant"
                              >
                                {isDeleting ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination - Scroll Sentinel */}
                {nextCursor && (
                  <div
                    ref={sentinelRef}
                    data-testid="variants-scroll-sentinel"
                    className="flex justify-center pt-2 pb-1"
                  >
                    {loadingMore ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Spinner className="size-3.5" />
                        <span>{t('products.variants.loadMore')}</span>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleLoadMore()}
                        disabled={loadingMore}
                      >
                        {t('products.variants.loadMore')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </ModalBody>

          <ModalFooter className="shrink-0 border-t border-border pt-3 flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex flex-row flex-wrap items-center gap-2">
              {onBackToOptions && product && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onBackToOptions(product);
                  }}
                  className="gap-2 w-full sm:w-auto"
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
                  className="gap-2 w-full sm:w-auto"
                >
                  <ImageIcon className="size-4" />
                  {t('products.mediaAction')}
                </Button>
              )}
              {onManageOffers && product && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onManageOffers(product);
                  }}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Boxes className="size-4" />
                  {t('products.offersAction')}
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
          existingVariants={allExistingVariants.length > 0 ? allExistingVariants : variants}
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
          onConflict={() => void resyncVariants()}
        />
      )}

      {/* Cascade Delete Variant & Attached Offers Confirmation Modal */}
      {cascadeVariantToDelete && (
        <CascadeVariantOfferDeleteConfirmModal
          open={Boolean(cascadeVariantToDelete)}
          onOpenChange={(next) => {
            if (!next && !cascadeDeleting) setCascadeVariantToDelete(null);
          }}
          variantLabel={labelOfVariant(cascadeVariantToDelete.variant)}
          offerCount={cascadeVariantToDelete.offerCount}
          onConfirm={handleConfirmCascadeDelete}
          loading={cascadeDeleting}
        />
      )}
    </>
  );
}
