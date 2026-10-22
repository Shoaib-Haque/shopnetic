'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CreateWarehouseRequest, SellerWithShop, Warehouse } from '@shopnetic/contracts';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createWarehouse } from './api';

export interface WarehouseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId?: string;
  sellerName?: string;
  sellers?: SellerWithShop[];
  onCreated: (warehouse: Warehouse) => void;
}

const warehouseFormSchema = z.object({
  sellerId: z.string().trim().uuid('products.offers.warehouseModal.err.sellerRequired'),
  name: z
    .string()
    .trim()
    .min(1, 'products.offers.warehouseModal.err.nameRequired')
    .max(100, 'products.offers.warehouseModal.err.nameLong'),
  isDefault: z.boolean(),
  line1: z.string().trim().min(1, 'products.offers.warehouseModal.err.line1Required'),
  line2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().min(1, 'products.offers.warehouseModal.err.cityRequired'),
  state: z.string().trim().optional().or(z.literal('')),
  postalCode: z.string().trim().min(1, 'products.offers.warehouseModal.err.postalCodeRequired'),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'products.offers.warehouseModal.err.countryFormat'),
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
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: {
      sellerId: sellerId ?? '',
      name: '',
      isDefault: false,
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    },
  });

  function fieldError(field: Path<WarehouseFormValues>): string | undefined {
    const err = errors[field];
    if (!err) return undefined;
    return err.message?.startsWith('products.') ? t(err.message) : err.message;
  }

  useEffect(() => {
    reset({
      sellerId: sellerId ?? '',
      name: '',
      isDefault: false,
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    });
    setServerError(null);
  }, [open, sellerId, reset]);

  const onValidSubmit = async (data: WarehouseFormValues) => {
    setServerError(null);

    const body: CreateWarehouseRequest = {
      sellerId: data.sellerId,
      name: data.name.trim(),
      isDefault: data.isDefault,
      address: {
        line1: data.line1.trim(),
        line2: data.line2?.trim() || undefined,
        city: data.city.trim(),
        state: data.state?.trim() || undefined,
        postalCode: data.postalCode.trim(),
        country: data.country.trim().toUpperCase(),
      },
    };

    try {
      const created = await createWarehouse(body);
      notify.saved(t('products.offers.toast.warehouseCreated', { name: created.name }));
      onCreated(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <ModalContent className="max-w-lg max-h-[85vh] flex flex-col">
        <form onSubmit={handleSubmit(onValidSubmit)} className="flex min-h-0 flex-1 flex-col">
          <ModalHeader className="shrink-0 border-b border-border pb-4">
            <ModalTitle>{t('products.offers.warehouseModal.title')}</ModalTitle>
            <ModalDescription>
              {sellerName
                ? t('products.offers.warehouseModal.subtitle', { seller: sellerName })
                : t('products.offers.warehouseModal.subtitleGeneric')}
            </ModalDescription>
          </ModalHeader>

          <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
            {serverError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {serverError}
              </div>
            )}

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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="wh-seller" invalid={Boolean(errors.sellerId)}>
                        <SelectValue
                          placeholder={t('products.offers.warehouseModal.selectSellerPlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(sellers ?? []).map((s) => {
                          const is1P = s.shop?.slug === 'shopnetic-retail';
                          const typeTag = is1P ? '1P' : '3P';
                          const name = s.shop?.displayName ?? s.legalName ?? s.id;
                          const handle = s.shop?.slug ? `@${s.shop.slug}` : `#${s.id.slice(0, 8)}`;
                          const label = `${name} (${typeTag}) • ${handle}`;
                          return (
                            <SelectItem key={s.id} value={s.id} title={label}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}

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

            <div className="space-y-3 pt-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Field
                  label={t('products.offers.warehouseModal.country')}
                  htmlFor="wh-country"
                  error={fieldError('country')}
                >
                  <Input
                    id="wh-country"
                    {...register('country')}
                    maxLength={2}
                    disabled={isSubmitting}
                    invalid={Boolean(errors.country)}
                  />
                </Field>
              </div>
            </div>
          </ModalBody>

          <ModalFooter className="shrink-0 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {t('products.offers.warehouseModal.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {t('products.offers.warehouseModal.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
