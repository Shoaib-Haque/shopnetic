'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Checkbox, Spinner } from '@shopnetic/ui';
import { Edit2, AlertCircle, RefreshCw } from 'lucide-react';
import type { WizardFormData } from './hooks/use-wizard-storage';

interface StepReviewProps {
  data: WizardFormData;
  isResubmission?: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  onGoToStep: (step: number) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function StepReview({
  data,
  isResubmission,
  isSubmitting,
  submitError,
  onGoToStep,
  onSubmit,
  onBack,
}: StepReviewProps) {
  const t = useTranslations('onboarding');
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('step3Title')}</h2>
        <p className="text-sm text-muted-foreground">{t('step3Subtitle')}</p>
      </div>

      {submitError && (
        <div
          role="alert"
          data-testid="registration-error-card"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h4 className="font-semibold">{t('submissionErrorTitle')}</h4>
                <p className="text-sm opacity-90">{submitError}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              data-testid="btn-retry-submit"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="shrink-0 gap-1 border-destructive/30 hover:bg-destructive/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{t('tryAgain')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Legal Entity Card */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              {t('legalEntitySummary')}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="btn-edit-legal"
              onClick={() => onGoToStep(1)}
              className="h-7 px-2 text-xs gap-1"
            >
              <Edit2 className="h-3 w-3" />
              <span>{t('edit')}</span>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t('legalNameLabel')}:</dt>
            <dd className="font-medium text-right text-foreground truncate">{data.legalName}</dd>
            <dt className="text-muted-foreground">{t('entityTypeLabel')}:</dt>
            <dd className="font-medium text-right text-foreground capitalize">
              {data.type === 'business' ? t('entityTypeBusiness') : t('entityTypeIndividual')}
            </dd>
            <dt className="text-muted-foreground">{t('countryLabel')}:</dt>
            <dd className="font-medium text-right text-foreground uppercase">{data.country}</dd>
          </dl>
        </div>

        {/* Shop Profile Card */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              {t('shopProfileSummary')}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="btn-edit-shop"
              onClick={() => onGoToStep(2)}
              className="h-7 px-2 text-xs gap-1"
            >
              <Edit2 className="h-3 w-3" />
              <span>{t('edit')}</span>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t('displayNameLabel')}:</dt>
            <dd className="font-medium text-right text-foreground truncate">{data.displayName}</dd>
            <dt className="text-muted-foreground">{t('slugLabel')}:</dt>
            <dd className="font-medium text-right text-foreground font-mono text-xs truncate">
              {data.slug}
            </dd>
            {data.description && (
              <>
                <dt className="text-muted-foreground">{t('descriptionLabel')}:</dt>
                <dd className="font-medium text-right text-foreground truncate">
                  {data.description}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Terms Agreement Checkbox */}
      <div className="rounded-lg border bg-muted/40 p-4">
        <label
          htmlFor="agreeTerms"
          data-testid="label-agree-terms"
          className="flex items-start gap-3 cursor-pointer select-none"
        >
          <Checkbox
            id="agreeTerms"
            data-testid="checkbox-agree-terms"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(!!checked)}
            className="mt-0.5"
          />
          <div className="text-sm">
            <span className="font-medium text-foreground">{t('agreementLabel')}</span>
            <p className="text-muted-foreground text-xs mt-0.5">{t('agreementDescription')}</p>
          </div>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          data-testid="btn-step3-back"
          onClick={onBack}
          disabled={isSubmitting}
        >
          {t('back')}
        </Button>
        <Button
          type="button"
          data-testid="btn-submit-application"
          onClick={onSubmit}
          disabled={!agreed || isSubmitting}
          className="gap-2 min-w-44"
        >
          {isSubmitting ? (
            <>
              <Spinner className="size-4" />
              <span>{isResubmission ? t('resubmitting') : t('submitting')}</span>
            </>
          ) : (
            <span>{isResubmission ? t('resubmitApplication') : t('submitApplication')}</span>
          )}
        </Button>
      </div>
    </div>
  );
}
