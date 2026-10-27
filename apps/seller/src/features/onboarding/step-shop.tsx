'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input, Field, Spinner } from '@shopnetic/ui';
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import type { WizardFormData } from './hooks/use-wizard-storage';
import { useSlugCheck } from './hooks/use-slug-check';

interface StepShopProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  initialValidSlug?: string | undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function StepShop({ data, onChange, onNext, onBack, initialValidSlug }: StepShopProps) {
  const t = useTranslations('onboarding');
  const [touched, setTouched] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const { status: slugStatus, errorDetail: slugErrorDetail } = useSlugCheck(
    data.slug,
    initialValidSlug,
  );

  const displayNameError =
    touched && data.displayName.trim().length < 2 ? t('displayNameMinError') : undefined;

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const isSlugFormatValid =
    data.slug.length >= 3 && data.slug.length <= 50 && slugRegex.test(data.slug);

  const isSlugBlocked = slugStatus === 'taken' || slugStatus === 'checking' || !isSlugFormatValid;

  const isFormValid = data.displayName.trim().length >= 2 && !isSlugBlocked;

  function handleDisplayNameChange(val: string) {
    if (!slugManuallyEdited && (!initialValidSlug || data.slug === '')) {
      onChange({ displayName: val, slug: slugify(val) });
    } else {
      onChange({ displayName: val });
    }
  }

  function handleContinue() {
    setTouched(true);
    if (isFormValid) {
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('step2Title')}</h2>
        <p className="text-sm text-muted-foreground">{t('step2Subtitle')}</p>
      </div>

      <div className="space-y-4">
        <Field label={t('displayNameLabel')} error={displayNameError}>
          <Input
            id="displayName"
            data-testid="input-shop-name"
            value={data.displayName}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            placeholder={t('displayNamePlaceholder')}
            aria-invalid={!!displayNameError}
          />
        </Field>

        <Field label={t('slugLabel')}>
          <div className="relative">
            <Input
              id="slug"
              data-testid="input-shop-slug"
              value={data.slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                onChange({ slug: slugify(e.target.value) });
              }}
              placeholder="shop-name"
              className={
                slugStatus === 'taken' ? 'border-destructive focus-visible:ring-destructive' : ''
              }
              aria-invalid={slugStatus === 'taken'}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs">
              {slugStatus === 'checking' && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Spinner className="size-4" />
                  <span>{t('checkingAvailability')}</span>
                </span>
              )}
              {slugStatus === 'available' && isSlugFormatValid && (
                <span
                  data-testid="slug-available-indicator"
                  className="flex items-center gap-1 text-emerald-600 font-medium dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('slugAvailable')}</span>
                </span>
              )}
              {slugStatus === 'taken' && (
                <span
                  data-testid="slug-taken-indicator"
                  className="flex items-center gap-1 text-destructive font-medium"
                >
                  <AlertCircle className="h-4 w-4" />
                  <span>{t('slugTaken')}</span>
                </span>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {slugStatus === 'taken' && (
            <p
              data-testid="slug-error-message"
              className="mt-1 text-xs font-medium text-destructive"
            >
              {slugErrorDetail ?? t('slugTaken')}
            </p>
          )}
          {slugStatus === 'error' && (
            <p
              data-testid="slug-warning-message"
              className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{slugErrorDetail ?? t('slugCheckError')}</span>
            </p>
          )}
          {data.slug && !isSlugFormatValid && (
            <p className="mt-1 text-xs text-muted-foreground">{t('slugHint')}</p>
          )}
        </Field>

        <Field label={t('descriptionLabel')}>
          <textarea
            id="description"
            data-testid="textarea-description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={t('descriptionPlaceholder')}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t('logoUrlLabel')}>
            <Input
              id="logoUrl"
              data-testid="input-logo-url"
              value={data.logoUrl}
              onChange={(e) => onChange({ logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </Field>

          <Field label={t('bannerUrlLabel')}>
            <Input
              id="bannerUrl"
              data-testid="input-banner-url"
              value={data.bannerUrl}
              onChange={(e) => onChange({ bannerUrl: e.target.value })}
              placeholder="https://example.com/banner.png"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" data-testid="btn-step2-back" onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          type="button"
          data-testid="btn-step2-continue"
          onClick={handleContinue}
          disabled={slugStatus === 'taken' || slugStatus === 'checking' || !isSlugFormatValid}
        >
          {t('continue')}
        </Button>
      </div>
    </div>
  );
}
