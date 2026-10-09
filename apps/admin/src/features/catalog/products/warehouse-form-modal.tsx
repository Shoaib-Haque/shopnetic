'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CreateWarehouseRequest, Warehouse } from '@shopnetic/contracts';
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
  Spinner,
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createWarehouse } from './api';

export interface WarehouseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  sellerName: string;
  onCreated: (warehouse: Warehouse) => void;
}

export function WarehouseFormModal({
  open,
  onOpenChange,
  sellerId,
  sellerName,
  onCreated,
}: WarehouseFormModalProps) {
  const t = useTranslations('catalog');

  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setIsDefault(false);
    setLine1('');
    setLine2('');
    setCity('');
    setState('');
    setPostalCode('');
    setCountry('US');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !line1.trim() || !city.trim() || !postalCode.trim() || !country.trim()) {
      setError(t('errors.validation'));
      return;
    }

    setSubmitting(true);
    setError(null);

    const body: CreateWarehouseRequest = {
      sellerId,
      name: name.trim(),
      isDefault,
      address: {
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        postalCode: postalCode.trim(),
        country: country.trim().toUpperCase(),
      },
    };

    try {
      const created = await createWarehouse(body);
      notify.saved(t('products.offers.toast.warehouseCreated', { name: created.name }));
      onCreated(created);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(t(catalogErrorKey(err instanceof AdminApiError ? err.code : undefined)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <ModalContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>{t('products.offers.warehouseModal.title')}</ModalTitle>
            <ModalDescription>
              {t('products.offers.warehouseModal.subtitle', { seller: sellerName })}
            </ModalDescription>
          </ModalHeader>

          <ModalBody className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <Field label={t('products.offers.warehouseModal.name')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('products.offers.warehouseModal.namePlaceholder')}
                disabled={submitting}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="wh-default"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(Boolean(checked))}
                disabled={submitting}
              />
              <label
                htmlFor="wh-default"
                className="cursor-pointer text-sm font-medium text-foreground select-none"
              >
                {t('products.offers.warehouseModal.isDefault')}
              </label>
            </div>

            <div className="space-y-3 pt-2">
              <Field label={t('products.offers.warehouseModal.line1')}>
                <Input
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder={t('products.offers.warehouseModal.line1Placeholder')}
                  disabled={submitting}
                />
              </Field>

              <Field label={t('products.offers.warehouseModal.line2')}>
                <Input
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  placeholder={t('products.offers.warehouseModal.line2Placeholder')}
                  disabled={submitting}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('products.offers.warehouseModal.city')}>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={submitting}
                  />
                </Field>
                <Field label={t('products.offers.warehouseModal.state')}>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    disabled={submitting}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('products.offers.warehouseModal.postalCode')}>
                  <Input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    disabled={submitting}
                  />
                </Field>
                <Field label={t('products.offers.warehouseModal.country')}>
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    maxLength={2}
                    disabled={submitting}
                  />
                </Field>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              {t('products.offers.warehouseModal.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="size-4" />
                  <span>{t('products.offers.warehouseModal.save')}</span>
                </>
              ) : (
                <span>{t('products.offers.warehouseModal.save')}</span>
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
