'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import {
  COUNTRIES,
  isValidPostalCode,
  WAREHOUSE_CITY_MAX,
  WAREHOUSE_LINE1_MAX,
  WAREHOUSE_LINE2_MAX,
  WAREHOUSE_NAME_MAX,
  WAREHOUSE_POSTAL_MAX,
  WAREHOUSE_STATE_MAX,
  type CreateWarehouseRequest,
  type SellerWithShop,
  type Warehouse,
} from '@shopnetic/contracts';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  notify,
} from '@shopnetic/ui';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createWarehouse } from './api';
import { SellerCombobox } from './seller-combobox';

export interface WarehouseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId?: string;
  sellerName?: string;
  sellers?: SellerWithShop[];
  onCreated: (warehouse: Warehouse) => void;
}

export function CountryCombobox({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder = 'Select country…',
  searchPlaceholder = 'Search countries…',
  emptyText = 'No countries found',
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedCountry = useMemo(
    () => COUNTRIES.find((c) => c.code.toLowerCase() === (value ?? '').toLowerCase()),
    [value],
  );

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: filteredCountries.length,
    onSelect: (index) => {
      const selected = filteredCountries[index];
      if (selected) {
        onChange(selected.code);
        setOpen(false);
        setSearch('');
      }
    },
    onClose: () => setOpen(false),
    resetOn: [filteredCountries],
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
          aria-label={
            selectedCountry ? `${selectedCountry.name} (${selectedCountry.code})` : placeholder
          }
          disabled={disabled}
          className={`flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
            invalid ? 'border-destructive' : 'border-border'
          }`}
        >
          <span
            className={`truncate text-left ${
              selectedCountry ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {selectedCountry ? `${selectedCountry.name} (${selectedCountry.code})` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] max-w-[22rem] p-2 shadow-lg z-[60]"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div
          ref={listboxRef}
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filteredCountries.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            filteredCountries.map((c, index) => {
              const isSelected = c.code.toLowerCase() === (value ?? '').toLowerCase();
              const { onMouseEnter, isHighlighted } = getOptionProps(index);
              return (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-label={`${c.name} (${c.code})`}
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors text-left ${
                    isSelected
                      ? isHighlighted
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'bg-primary/10 text-primary font-medium'
                      : isHighlighted
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-[11px] text-muted-foreground w-6">
                      {c.code}
                    </span>
                    <span className="truncate">{c.name}</span>
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const warehouseFormSchema = z
  .object({
    sellerId: z.string().trim().uuid('products.offers.warehouseModal.err.sellerRequired'),
    name: z
      .string()
      .trim()
      .min(1, 'products.offers.warehouseModal.err.nameRequired')
      .max(WAREHOUSE_NAME_MAX, 'products.offers.warehouseModal.err.nameLong'),
    isDefault: z.boolean(),
    country: z.string().trim().min(1, 'products.offers.warehouseModal.err.countryRequired'),
    line1: z
      .string()
      .trim()
      .min(1, 'products.offers.warehouseModal.err.line1Required')
      .max(WAREHOUSE_LINE1_MAX, 'products.offers.warehouseModal.err.line1Long'),
    line2: z
      .string()
      .trim()
      .max(WAREHOUSE_LINE2_MAX, 'products.offers.warehouseModal.err.line2Long')
      .optional()
      .or(z.literal('')),
    city: z
      .string()
      .trim()
      .min(1, 'products.offers.warehouseModal.err.cityRequired')
      .max(WAREHOUSE_CITY_MAX, 'products.offers.warehouseModal.err.cityLong'),
    state: z
      .string()
      .trim()
      .max(WAREHOUSE_STATE_MAX, 'products.offers.warehouseModal.err.stateLong')
      .optional()
      .or(z.literal('')),
    postalCode: z
      .string()
      .trim()
      .min(1, 'products.offers.warehouseModal.err.postalCodeRequired')
      .max(WAREHOUSE_POSTAL_MAX, 'products.offers.warehouseModal.err.postalCodeLong'),
  })
  .refine((data) => isValidPostalCode(data.postalCode, data.country), {
    path: ['postalCode'],
    message: 'products.offers.warehouseModal.err.postalCodeInvalid',
  });

type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;

export function WarehouseFormModal({
  open,
  onOpenChange,
  sellerId,
  sellerName,
  sellers,
  onCreated,
}: WarehouseFormModalProps) {
  const t = useTranslations('catalog');
  const tAdmin = useTranslations('admin');
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: {
      sellerId: sellerId ?? '',
      name: '',
      isDefault: false,
      country: 'US',
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
    },
  });

  function fieldError(field: Path<WarehouseFormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  useEffect(() => {
    if (open) {
      reset({
        sellerId: sellerId ?? '',
        name: '',
        isDefault: false,
        country: 'US',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
      });
      setServerError(null);
      setConfirmDiscard(false);
    }
  }, [open, sellerId, reset]);

  const handleClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onOpenChange(false);
    }
  };

  const onSubmit = async (values: WarehouseFormValues) => {
    setServerError(null);
    try {
      const payload: CreateWarehouseRequest = {
        sellerId: values.sellerId,
        name: values.name,
        isDefault: values.isDefault,
        address: {
          line1: values.line1,
          line2: values.line2 ? values.line2 : undefined,
          city: values.city,
          state: values.state ? values.state : undefined,
          postalCode: values.postalCode,
          country: values.country.toUpperCase(),
        },
      };

      const created = await createWarehouse(payload);
      notify.saved(t('products.offers.toast.warehouseCreated', { name: created.name }));
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setServerError(t(catalogErrorKey(err.code)));
      } else {
        setServerError(t('errors.generic'));
      }
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            handleClose();
          } else {
            onOpenChange(true);
          }
        }}
      >
        <ModalContent size="md" className="max-h-[90vh] flex flex-col p-0">
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col min-h-0 flex-1"
          >
            <ModalHeader className="shrink-0 border-b border-border pb-3 pr-12">
              <ModalTitle>{t('products.offers.warehouseModal.title')}</ModalTitle>
              <ModalDescription>
                {sellerName
                  ? t('products.offers.warehouseModal.subtitle', { seller: sellerName })
                  : t('products.offers.warehouseModal.subtitleGeneric')}
              </ModalDescription>
            </ModalHeader>

            <ModalBody className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
              {serverError && (
                <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  {serverError}
                </div>
              )}

              {/* Seller Selector (if not preselected) */}
              {!sellerId && (
                <Field
                  label={t('products.offers.warehouseModal.seller')}
                  htmlFor="wh-seller"
                  error={fieldError('sellerId')}
                >
                  <Controller
                    control={control}
                    name="sellerId"
                    render={({ field }) => (
                      <SellerCombobox
                        id="wh-seller"
                        value={field.value}
                        onChange={field.onChange}
                        sellers={sellers ?? []}
                        disabled={isSubmitting}
                        invalid={Boolean(errors.sellerId)}
                        placeholder={t('products.offers.warehouseModal.selectSellerPlaceholder')}
                      />
                    )}
                  />
                </Field>
              )}

              {/* Warehouse Name */}
              <Field
                label={t('products.offers.warehouseModal.name')}
                htmlFor="wh-name"
                error={fieldError('name')}
              >
                <Input
                  id="wh-name"
                  {...register('name')}
                  placeholder={t('products.offers.warehouseModal.namePlaceholder')}
                  disabled={isSubmitting}
                  invalid={Boolean(errors.name)}
                />
              </Field>

              {/* Is Default Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <Controller
                  control={control}
                  name="isDefault"
                  render={({ field }) => (
                    <Checkbox
                      id="wh-default"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <label
                  htmlFor="wh-default"
                  className="cursor-pointer text-sm font-medium text-foreground select-none"
                >
                  {t('products.offers.warehouseModal.isDefault')}
                </label>
              </div>

              {/* Address Fields - Reordered: Country first, Line1, Line2, City, State, Postal */}
              <div className="space-y-3 pt-2">
                <Field
                  label={t('products.offers.warehouseModal.country')}
                  htmlFor="wh-country"
                  error={fieldError('country')}
                >
                  <Controller
                    control={control}
                    name="country"
                    render={({ field }) => (
                      <CountryCombobox
                        id="wh-country"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        invalid={Boolean(errors.country)}
                        placeholder={t('products.offers.warehouseModal.selectCountry')}
                        searchPlaceholder={t('products.offers.warehouseModal.searchCountry')}
                        emptyText={t('products.offers.warehouseModal.noCountries')}
                      />
                    )}
                  />
                </Field>

                <Field
                  label={t('products.offers.warehouseModal.line1')}
                  htmlFor="wh-line1"
                  error={fieldError('line1')}
                >
                  <Input
                    id="wh-line1"
                    {...register('line1')}
                    placeholder={t('products.offers.warehouseModal.line1Placeholder')}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.line1)}
                  />
                </Field>

                <Field
                  label={t('products.offers.warehouseModal.line2')}
                  htmlFor="wh-line2"
                  error={fieldError('line2')}
                >
                  <Input
                    id="wh-line2"
                    {...register('line2')}
                    placeholder={t('products.offers.warehouseModal.line2Placeholder')}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.line2)}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label={t('products.offers.warehouseModal.city')}
                    htmlFor="wh-city"
                    error={fieldError('city')}
                  >
                    <Input
                      id="wh-city"
                      {...register('city')}
                      disabled={isSubmitting}
                      invalid={Boolean(errors.city)}
                    />
                  </Field>
                  <Field
                    label={t('products.offers.warehouseModal.state')}
                    htmlFor="wh-state"
                    error={fieldError('state')}
                  >
                    <Input
                      id="wh-state"
                      {...register('state')}
                      disabled={isSubmitting}
                      invalid={Boolean(errors.state)}
                    />
                  </Field>
                </div>

                <Field
                  label={t('products.offers.warehouseModal.postalCode')}
                  htmlFor="wh-postal-code"
                  error={fieldError('postalCode')}
                >
                  <Input
                    id="wh-postal-code"
                    {...register('postalCode')}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.postalCode)}
                  />
                </Field>
              </div>
            </ModalBody>

            <ModalFooter className="shrink-0 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                {t('products.offers.warehouseModal.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? tAdmin('actions.saving') : t('products.offers.warehouseModal.save')}
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
          onOpenChange(false);
        }}
      />
    </>
  );
}
