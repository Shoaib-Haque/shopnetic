'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, RefreshCw } from 'lucide-react';
import {
  VALID_SELLER_STATUS_TRANSITIONS,
  type SellerStatus,
  type SellerWithShop,
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
  Spinner,
  StatusBadge,
  type StatusTone,
  notify,
} from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { getSeller, updateSellerStatus } from './api';

export const SELLER_STATUS_TONE: Record<SellerStatus, StatusTone> = {
  draft: 'neutral',
  in_review: 'warning',
  approved: 'success',
  suspended: 'danger',
  offboarding: 'warning',
  closed: 'neutral',
};

const textareaCls =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export interface SellerInspectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seller: SellerWithShop | null;
  onUpdated: (updated: SellerWithShop) => void;
  locale?: string;
  basePath?: string;
}

export function SellerInspectModal({
  open,
  onOpenChange,
  seller,
  onUpdated,
  locale = 'en',
  basePath = 'x7f2k9t3m1qp',
}: SellerInspectModalProps) {
  const t = useTranslations('sellers');
  const tCommon = useTranslations('admin');
  const reasonId = useId();

  const [currentSeller, setCurrentSeller] = useState<SellerWithShop | null>(seller);
  const [targetStatus, setTargetStatus] = useState<SellerStatus | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setCurrentSeller(seller);
    setTargetStatus(null);
    setReason('');
    setErrorMsg(null);
    setConflict(false);
  }, [seller, open]);

  if (!currentSeller) return null;

  const validTransitions = VALID_SELLER_STATUS_TRANSITIONS[currentSeller.status] ?? [];
  const isTerminal = validTransitions.length === 0;

  const isDisciplinary =
    targetStatus === 'suspended' || targetStatus === 'offboarding' || targetStatus === 'closed';

  const isReasonValid = !isDisciplinary || reason.trim().length >= 5;

  const handleReload = async () => {
    try {
      setReloading(true);
      setErrorMsg(null);
      const fresh = await getSeller(currentSeller.id);
      setCurrentSeller(fresh);
      setTargetStatus(null);
      setReason('');
      setConflict(false);
    } catch {
      setErrorMsg(t('loadError'));
    } finally {
      setReloading(false);
    }
  };

  const handleApplyTransition = async () => {
    if (!targetStatus || submitting) return;
    if (isDisciplinary && reason.trim().length < 5) {
      setErrorMsg(t('inspect.reasonMinLength'));
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      setConflict(false);

      const updated = await updateSellerStatus(currentSeller.id, {
        status: targetStatus,
        reason: reason.trim() ? reason.trim() : undefined,
        expectedUpdatedAt: currentSeller.updatedAt,
      });

      notify.saved(
        t('toast.statusUpdated', {
          name: currentSeller.shop?.displayName || currentSeller.legalName,
          status: t(`status.${updated.status}`),
        }),
      );
      onUpdated(updated);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof AdminApiError) {
        if (e.status === 409 || e.code === 'CONFLICT') {
          setConflict(true);
          return;
        }
        if (e.status === 422 && e.code === 'SELLER_STATUS_TRANSITION_INVALID') {
          setErrorMsg(t('inspect.noTransitions'));
          return;
        }
      }
      setErrorMsg(tCommon('errorBody'));
    } finally {
      setSubmitting(false);
    }
  };

  const auditLogHref = `/${locale}/${basePath}/audit-log?targetId=${encodeURIComponent(currentSeller.id)}&targetType=seller`;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <ModalTitle>{t('inspect.title')}</ModalTitle>
          <ModalDescription>{t('inspect.subtitle')}</ModalDescription>
        </ModalHeader>

        <ModalBody className="space-y-6">
          {/* Conflict Banner */}
          {conflict && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-semibold">{t('inspect.conflictTitle')}</p>
              <p className="mt-1 text-xs">{t('inspect.conflictMessage')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5 gap-1.5"
                disabled={reloading}
                onClick={() => void handleReload()}
              >
                {reloading && <Spinner className="size-3" />}
                <RefreshCw className="size-3.5" aria-hidden />
                {t('inspect.conflictReload')}
              </Button>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && !conflict && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Storefront Profile */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">{t('inspect.shopSection')}</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.displayName')}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {currentSeller.shop?.displayName || '—'}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">{t('inspect.slug')}</span>
                <span className="text-sm font-mono text-muted-foreground">
                  {currentSeller.shop?.slug ? `/${currentSeller.shop.slug}` : '—'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.description')}
                </span>
                <p className="mt-0.5 text-xs text-foreground">
                  {currentSeller.shop?.description || t('inspect.noDescription')}
                </p>
              </div>
              {currentSeller.shop?.vacationUntil && (
                <div className="sm:col-span-2">
                  <span className="block text-xs text-muted-foreground">
                    {t('inspect.vacationUntil')}
                  </span>
                  <span className="text-xs font-mono text-warning">
                    {new Date(currentSeller.shop.vacationUntil).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Legal & Account Information */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t('inspect.legalSection')}</h3>
              <a
                href={auditLogHref}
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                <span>{t('inspect.viewAuditLog')}</span>
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.legalName')}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {currentSeller.legalName}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">{t('inspect.type')}</span>
                <StatusBadge tone="neutral" className="mt-0.5">
                  {t(`type.${currentSeller.type}`)}
                </StatusBadge>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">{t('inspect.country')}</span>
                <span className="text-sm font-mono font-medium text-foreground">
                  {currentSeller.country}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.accountEmail')}
                </span>
                <span className="text-sm text-foreground">{currentSeller.accountEmail || '—'}</span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">{t('inspect.sellerId')}</span>
                <span className="text-xs font-mono text-muted-foreground select-all">
                  {currentSeller.id}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.accountId')}
                </span>
                <span className="text-xs font-mono text-muted-foreground select-all">
                  {currentSeller.accountId}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.createdAt')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(currentSeller.createdAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  {t('inspect.updatedAt')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(currentSeller.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Status Moderation */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t('inspect.moderationSection')}
            </h3>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('inspect.currentStatus')}:</span>
              <StatusBadge tone={SELLER_STATUS_TONE[currentSeller.status]}>
                {t(`status.${currentSeller.status}`)}
              </StatusBadge>
            </div>

            {isTerminal ? (
              <p className="mt-3 text-xs text-muted-foreground italic">
                {t('inspect.terminalState')}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t('inspect.targetStatus')}:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {validTransitions.map((st) => (
                      <Button
                        key={st}
                        type="button"
                        size="sm"
                        variant={targetStatus === st ? 'primary' : 'outline'}
                        onClick={() => {
                          setTargetStatus(st);
                          setErrorMsg(null);
                        }}
                      >
                        {t(`status.${st}`)}
                      </Button>
                    ))}
                  </div>
                </div>

                {targetStatus && (
                  <Field
                    label={`${t('inspect.reasonLabel')}${isDisciplinary ? ' *' : ''}`}
                    htmlFor={reasonId}
                    error={
                      isDisciplinary && reason.length > 0 && reason.trim().length < 5
                        ? t('inspect.reasonMinLength')
                        : undefined
                    }
                  >
                    <textarea
                      id={reasonId}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder={
                        isDisciplinary
                          ? t('inspect.reasonPlaceholderRequired')
                          : t('inspect.reasonPlaceholderOptional')
                      }
                      rows={3}
                      className={textareaCls}
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('inspect.close')}
          </Button>

          {!isTerminal && (
            <Button
              type="button"
              disabled={!targetStatus || !isReasonValid || submitting || conflict}
              onClick={() => void handleApplyTransition()}
            >
              {submitting && <Spinner className="size-4" />}
              {submitting ? t('inspect.updating') : t('inspect.applyTransition')}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
