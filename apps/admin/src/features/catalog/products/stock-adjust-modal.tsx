'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Check, Plus } from 'lucide-react';
import type { Offer, StockLevel, UpdateStockRequest, Warehouse } from '@shopnetic/contracts';
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
  Spinner,
  StatusBadge,
  Switch,
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { integerKeyDownHandler, integerPasteHandler } from '@/lib/numeric-input';
import { updateStock } from './api';

export interface StockAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
  warehouses: Warehouse[];
  onStockUpdated: (offerId: string, level: StockLevel) => void;
  onNewWarehouseRequested?: () => void;
}

interface WarehouseStockRowState {
  onHand: string;
  safetyStock: string;
  backorder: boolean;
  restockEta: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  fieldErrors: {
    onHand?: string | undefined;
    safetyStock?: string | undefined;
  };
}

export function StockAdjustModal({
  open,
  onOpenChange,
  offer,
  warehouses,
  onStockUpdated,
  onNewWarehouseRequested,
}: StockAdjustModalProps) {
  const t = useTranslations('catalog');

  const [rowStates, setRowStates] = useState<Record<string, WarehouseStockRowState>>({});
  const offerId = offer?.id;
  const lastOfferIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !offer) {
      setRowStates({});
      lastOfferIdRef.current = null;
      return;
    }

    const isDifferentOffer = lastOfferIdRef.current !== offerId;
    lastOfferIdRef.current = offerId ?? null;

    setRowStates((prev) => {
      const next: Record<string, WarehouseStockRowState> = {};
      for (const wh of warehouses) {
        const existingRow = isDifferentOffer ? undefined : prev[wh.id];
        if (existingRow) {
          next[wh.id] = existingRow;
        } else {
          const existing = offer.stocks.find((s) => s.warehouseId === wh.id);
          next[wh.id] = {
            onHand: existing ? String(existing.onHand) : '0',
            safetyStock: existing ? String(existing.safetyStock) : '0',
            backorder: existing ? existing.backorder : false,
            restockEta: existing && existing.restockEta ? existing.restockEta.slice(0, 10) : '',
            saving: false,
            saved: false,
            error: null,
            fieldErrors: {},
          };
        }
      }
      return next;
    });
  }, [open, offerId, warehouses]);

  if (!offer) return null;

  const handleFieldChange = (
    warehouseId: string,
    field: 'onHand' | 'safetyStock' | 'backorder' | 'restockEta',
    value: unknown,
  ) => {
    setRowStates((prev) => {
      const current = prev[warehouseId] ?? {
        onHand: '0',
        safetyStock: '0',
        backorder: false,
        restockEta: '',
        saving: false,
        saved: false,
        error: null,
        fieldErrors: {},
      };

      const updatedFieldErrors = { ...current.fieldErrors };
      if (field === 'onHand') {
        const strVal = String(value ?? '').trim();
        if (strVal === '' || !/^\d+$/.test(strVal)) {
          updatedFieldErrors.onHand = t('products.offers.stockModal.err.onHandInvalid');
        } else {
          delete updatedFieldErrors.onHand;
        }
      }
      if (field === 'safetyStock') {
        const strVal = String(value ?? '').trim();
        if (strVal === '' || !/^\d+$/.test(strVal)) {
          updatedFieldErrors.safetyStock = t('products.offers.stockModal.err.safetyStockInvalid');
        } else {
          delete updatedFieldErrors.safetyStock;
        }
      }

      return {
        ...prev,
        [warehouseId]: {
          ...current,
          [field]: value,
          fieldErrors: updatedFieldErrors,
          saved: false,
          error: null,
        },
      };
    });
  };

  const handleSaveWarehouseStock = async (warehouse: Warehouse) => {
    const row = rowStates[warehouse.id];
    if (!row) return;

    const cleanOnHand = String(row.onHand ?? '').trim();
    const cleanSafety = String(row.safetyStock ?? '').trim();
    const onHandInvalid = cleanOnHand === '' || !/^\d+$/.test(cleanOnHand);
    const safetyInvalid = cleanSafety === '' || !/^\d+$/.test(cleanSafety);

    if (onHandInvalid || safetyInvalid) {
      setRowStates((prev) => ({
        ...prev,
        [warehouse.id]: {
          ...(prev[warehouse.id] as WarehouseStockRowState),
          fieldErrors: {
            onHand: onHandInvalid ? t('products.offers.stockModal.err.onHandInvalid') : undefined,
            safetyStock: safetyInvalid
              ? t('products.offers.stockModal.err.safetyStockInvalid')
              : undefined,
          },
        },
      }));
      return;
    }

    setRowStates((prev) => ({
      ...prev,
      [warehouse.id]: {
        ...(prev[warehouse.id] as WarehouseStockRowState),
        saving: true,
        error: null,
      },
    }));

    const existing = offer.stocks.find((s) => s.warehouseId === warehouse.id);

    const body: UpdateStockRequest = {
      onHand: Math.max(0, parseInt(cleanOnHand, 10)),
      safetyStock: Math.max(0, parseInt(cleanSafety, 10)),
      backorder: row.backorder,
      restockEta: row.restockEta ? new Date(row.restockEta).toISOString() : null,
      expectedUpdatedAt: existing?.updatedAt,
    };

    try {
      const updated = await updateStock(offer.id, warehouse.id, body);
      setRowStates((prev) => ({
        ...prev,
        [warehouse.id]: {
          ...(prev[warehouse.id] as WarehouseStockRowState),
          saving: false,
          saved: true,
          error: null,
        },
      }));
      notify.saved(t('products.offers.toast.stockUpdated', { warehouse: warehouse.name }));
      onStockUpdated(offer.id, updated);
    } catch (err) {
      const errKey = catalogErrorKey(err instanceof AdminApiError ? err.code : undefined);
      setRowStates((prev) => ({
        ...prev,
        [warehouse.id]: {
          ...(prev[warehouse.id] as WarehouseStockRowState),
          saving: false,
          saved: false,
          error: t(errKey),
        },
      }));
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <ModalHeader className="shrink-0 border-b border-border pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ModalTitle>
                {t('products.offers.stockModal.title', { seller: offer.sellerName })}
              </ModalTitle>
              <ModalDescription className="mt-1">
                {t('products.offers.stockModal.subtitle')}
              </ModalDescription>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{offer.skuCode}</span>
                <span>•</span>
                <span className="capitalize">
                  {t(`products.offers.condition.${offer.condition}`)}
                </span>
                <span>•</span>
                <span>
                  Total Available:{' '}
                  <strong className="text-foreground">{offer.totalAvailable}</strong> (
                  {offer.totalOnHand} on hand)
                </span>
              </div>
            </div>
            {onNewWarehouseRequested && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNewWarehouseRequested}
                className="gap-1.5 w-full sm:w-auto shrink-0"
              >
                <Plus className="size-3.5" />
                {t('products.offers.stockModal.addWarehouse')}
              </Button>
            )}
          </div>
        </ModalHeader>

        <ModalBody className="min-h-0 flex-1 overflow-y-auto space-y-4 py-4">
          {warehouses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <Building2 className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
              <p className="mt-2 text-sm font-medium text-foreground">
                {t('products.offers.stockModal.emptyWarehouses')}
              </p>
              {onNewWarehouseRequested && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-1.5"
                  onClick={onNewWarehouseRequested}
                >
                  <Plus className="size-3.5" />
                  {t('products.offers.stockModal.addWarehouse')}
                </Button>
              )}
            </div>
          ) : (
            warehouses.map((wh) => {
              const existing = offer.stocks.find((s) => s.warehouseId === wh.id);
              const reserved = existing ? existing.reserved : 0;
              const row = rowStates[wh.id] ?? {
                onHand: existing ? String(existing.onHand) : '0',
                safetyStock: existing ? String(existing.safetyStock) : '0',
                backorder: existing ? existing.backorder : false,
                restockEta: existing && existing.restockEta ? existing.restockEta.slice(0, 10) : '',
                saving: false,
                saved: false,
                error: null,
                fieldErrors: {},
              };

              const parsedOnHand = parseInt(row.onHand, 10) || 0;
              const liveAvailable = Math.max(0, parsedOnHand - reserved);

              return (
                <div
                  key={wh.id}
                  className="rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:border-border/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">{wh.name}</h4>
                      {wh.isDefault && (
                        <StatusBadge tone="neutral" className="text-[10px] uppercase">
                          Default
                        </StatusBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Reserved: <strong className="text-foreground">{reserved}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Available:{' '}
                        <strong className="text-primary font-mono">{liveAvailable}</strong>
                      </span>
                    </div>
                  </div>

                  {wh.address && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {wh.address.line1}, {wh.address.city}, {wh.address.country}
                    </p>
                  )}

                  {row.error && (
                    <div className="mt-2.5 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs font-medium text-destructive">
                      {row.error}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-start">
                    <Field
                      label={t('products.offers.stockModal.onHand')}
                      hint={t('products.offers.stockModal.onHandHint')}
                      error={row.fieldErrors.onHand}
                    >
                      <Input
                        type="number"
                        min={0}
                        value={row.onHand}
                        onChange={(e) => handleFieldChange(wh.id, 'onHand', e.target.value)}
                        onKeyDown={integerKeyDownHandler}
                        onPaste={(e) =>
                          integerPasteHandler(e, (val) => handleFieldChange(wh.id, 'onHand', val))
                        }
                        disabled={row.saving}
                        invalid={Boolean(row.fieldErrors.onHand)}
                        className="font-mono text-sm"
                      />
                    </Field>

                    <Field
                      label={t('products.offers.stockModal.safetyStock')}
                      hint={t('products.offers.stockModal.safetyStockHint')}
                      error={row.fieldErrors.safetyStock}
                    >
                      <Input
                        type="number"
                        min={0}
                        value={row.safetyStock}
                        onChange={(e) => handleFieldChange(wh.id, 'safetyStock', e.target.value)}
                        onKeyDown={integerKeyDownHandler}
                        onPaste={(e) =>
                          integerPasteHandler(e, (val) =>
                            handleFieldChange(wh.id, 'safetyStock', val),
                          )
                        }
                        disabled={row.saving}
                        invalid={Boolean(row.fieldErrors.safetyStock)}
                        className="font-mono text-sm"
                      />
                    </Field>

                    <Field label={t('products.offers.stockModal.restockEta')} hint="Optional ETA">
                      <Input
                        type="date"
                        value={row.restockEta}
                        onChange={(e) => handleFieldChange(wh.id, 'restockEta', e.target.value)}
                        disabled={row.saving}
                        className="text-xs"
                      />
                    </Field>

                    <div className="flex flex-col justify-end gap-1.5 pb-0.5">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <label
                          htmlFor={`backorder-${wh.id}`}
                          className="text-xs font-medium text-foreground cursor-pointer select-none"
                        >
                          {t('products.offers.stockModal.backorder')}
                        </label>
                        <Switch
                          id={`backorder-${wh.id}`}
                          aria-label={t('products.offers.stockModal.backorder')}
                          checked={row.backorder}
                          onCheckedChange={(checked) =>
                            handleFieldChange(wh.id, 'backorder', checked)
                          }
                          disabled={row.saving}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={row.saving}
                        onClick={() => handleSaveWarehouseStock(wh)}
                        className="w-full gap-1.5 mt-1"
                      >
                        {row.saving ? (
                          <>
                            <Spinner className="size-3.5" />
                            <span>Saving</span>
                          </>
                        ) : row.saved ? (
                          <>
                            <Check className="size-3.5 text-success" />
                            <span>Updated</span>
                          </>
                        ) : (
                          <span>{t('products.offers.stockModal.save')}</span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ModalBody>

        <ModalFooter className="shrink-0 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('products.offers.stockModal.cancel')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
