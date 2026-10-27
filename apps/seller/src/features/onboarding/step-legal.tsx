'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input, Field } from '@shopnetic/ui';
import type { WizardFormData } from './hooks/use-wizard-storage';

interface StepLegalProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  onNext: () => void;
}

export function StepLegal({ data, onChange, onNext }: StepLegalProps) {
  const t = useTranslations('onboarding');
  const [touched, setTouched] = useState(false);

  const legalNameError =
    touched && data.legalName.trim().length < 2 ? t('legalNameMinError') : undefined;
  const countryError =
    touched && !/^[A-Z]{2}$/.test(data.country.trim().toUpperCase())
      ? t('countryCodeError')
      : undefined;

  const isValid =
    data.legalName.trim().length >= 2 && /^[A-Z]{2}$/.test(data.country.trim().toUpperCase());

  function handleContinue() {
    setTouched(true);
    if (isValid) {
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('step1Title')}</h2>
        <p className="text-sm text-muted-foreground">{t('step1Subtitle')}</p>
      </div>

      <div className="space-y-4">
        <Field label={t('legalNameLabel')} error={legalNameError}>
          <Input
            id="legalName"
            data-testid="input-legal-name"
            value={data.legalName}
            onChange={(e) => {
              onChange({ legalName: e.target.value });
            }}
            placeholder={t('legalNamePlaceholder')}
            aria-invalid={!!legalNameError}
          />
        </Field>

        <Field label={t('entityTypeLabel')}>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              data-testid="entity-type-business"
              onClick={() => onChange({ type: 'business' })}
              className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                data.type === 'business'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/40'
              }`}
            >
              <span className="font-medium text-foreground">{t('entityTypeBusiness')}</span>
              <span className="text-xs text-muted-foreground mt-1">
                {t('entityTypeBusinessDesc')}
              </span>
            </button>

            <button
              type="button"
              data-testid="entity-type-individual"
              onClick={() => onChange({ type: 'individual' })}
              className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                data.type === 'individual'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/40'
              }`}
            >
              <span className="font-medium text-foreground">{t('entityTypeIndividual')}</span>
              <span className="text-xs text-muted-foreground mt-1">
                {t('entityTypeIndividualDesc')}
              </span>
            </button>
          </div>
        </Field>

        <Field label={t('countryLabel')} error={countryError}>
          <Input
            id="country"
            data-testid="input-country"
            value={data.country}
            onChange={(e) => {
              onChange({ country: e.target.value.toUpperCase().slice(0, 2) });
            }}
            placeholder={t('countryPlaceholder')}
            maxLength={2}
            className="uppercase"
            aria-invalid={!!countryError}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('countryHint')}</p>
        </Field>
      </div>

      <div className="flex justify-end pt-4">
        <Button
          type="button"
          data-testid="btn-step1-continue"
          onClick={handleContinue}
          disabled={touched && !isValid}
        >
          {t('continue')}
        </Button>
      </div>
    </div>
  );
}
