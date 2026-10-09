'use client';

import { useEffect, useState } from 'react';
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
  onHand: number;
  safetyStock: number;
  backorder: boolean;
  restockEta: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
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

  useEffect(() => {
    if (!offer || !open) return;
    const initial: Record<string, WarehouseStockRowState> = {};
    for (const wh of warehouses) {
      const existing = offer.stocks.find((s) => s.warehouseId === wh.id);
      initial[wh.id] = {
        onHand: existing ? existing.onHand : 0,
        safetyStock: existing ? existing.safetyStock : 0,
        backorder: existing ? existing.backorder : false,
        restockEta: existing && existing.restockEta ? existing.restockEta.slice(0, 10) : '',
        saving: false,
        saved: false,
        error: null,
      };
    }
    setRowStates(initial);
  }, [offer, warehouses, open]);

  if (!offer) return null;

  const handleFieldChange = (
    warehouseId: string,
    field: keyof Omit<WarehouseStockRowState, 'saving' | 'saved' | 'error'>,
    value: unknown,
  ) => {
    setRowStates((prev) => {
      const current = prev[warehouseId] ?? {
        onHand: 0,
        safetyStock: 0,
        backorder: false,
        restockEta: '',
        saving: false,
        saved: false,
        error: null,
      };
      return {
        ...prev,
        [warehouseId]: {
          ...current,
          [field]: value,
          saved: false,
          error: null,
        },
      };
    });
  };

  const handleSaveWarehouseStock = async (warehouse: Warehouse) => {
    const row = rowStates[warehouse.id];
    if (!row) return;

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
      onHand: Math.max(0, Math.floor(row.onHand || 0)),
      safetyStock: Math.max(0, Math.floor(row.safetyStock || 0)),
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <ModalTitle>
                {t('products.offers.stockModal.title', { seller: offer.sellerName })}
              </ModalTitle>
              <ModalDescription className="mt-1">
                {t('products.offers.stockModal.subtitle')}
              </ModalDescription>
            </div>
            {onNewWarehouseRequested && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNewWarehouseRequested}
                className="gap-1.5 shrink-0"
              >
                <Plus className="size-3.5" />
                {t('products.offers.stockModal.addWarehouse')}
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{offer.skuCode}</span>
            <span>•</span>
            <span className="capitalize">{t(`products.offers.condition.${offer.condition}`)}</span>
            <span>•</span>
            <span>
              Total Available: <strong className="text-foreground">{offer.totalAvailable}</strong> (
              {offer.totalOnHand} on hand)
            </span>
          </div>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto space-y-4 py-4">
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
                onHand: existing ? existing.onHand : 0,
                safetyStock: existing ? existing.safetyStock : 0,
                backorder: existing ? existing.backorder : false,
                restockEta: existing && existing.restockEta ? existing.restockEta.slice(0, 10) : '',
                saving: false,
                saved: false,
                error: null,
              };

              const liveAvailable = Math.max(0, (row.onHand || 0) - reserved);

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

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <Field
                      label={t('products.offers.stockModal.onHand')}
                      hint={t('products.offers.stockModal.onHandHint')}
                    >
                      <Input
                        type="number"
                        min={0}
                        value={row.onHand}
                        onChange={(e) =>
                          handleFieldChange(wh.id, 'onHand', parseInt(e.target.value, 10) || 0)
                        }
                        disabled={row.saving}
                        className="font-mono text-sm"
                      />
                    </Field>

                    <Field
                      label={t('products.offers.stockModal.safetyStock')}
                      hint={t('products.offers.stockModal.safetyStockHint')}
                    >
                      <Input
                        type="number"
                        min={0}
                        value={row.safetyStock}
                        onChange={(e) =>
                          handleFieldChange(wh.id, 'safetyStock', parseInt(e.target.value, 10) || 0)
                        }
                        disabled={row.saving}
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
