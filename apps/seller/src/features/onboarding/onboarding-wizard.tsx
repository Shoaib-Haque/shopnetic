'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { SellerWithShop } from '@shopnetic/contracts';
import { Check, ShieldCheck, Store, FileText } from 'lucide-react';
import { useWizardStorage, type WizardFormData } from './hooks/use-wizard-storage';
import { ChangesRequestedAlert } from './changes-requested-alert';
import { StepLegal } from './step-legal';
import { StepShop } from './step-shop';
import { StepReview } from './step-review';

interface OnboardingWizardProps {
  accountId: string;
  initialSeller?: SellerWithShop | null;
  locale: string;
}

export function OnboardingWizard({ accountId, initialSeller, locale }: OnboardingWizardProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { loadDraft, saveDraft, clearDraft } = useWizardStorage(accountId);

  const isResubmission = initialSeller?.status === 'draft';
  const lastReviewNote = initialSeller?.lastReviewNote ?? null;

  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<WizardFormData>(() => {
    // If resubmitting, prefer initialSeller values unless edited
    if (initialSeller) {
      return {
        legalName: initialSeller.legalName,
        type: initialSeller.type === 'individual' ? 'individual' : 'business',
        country: initialSeller.country,
        displayName: initialSeller.shop?.displayName ?? '',
        slug: initialSeller.shop?.slug ?? '',
        description: initialSeller.shop?.description ?? '',
        logoUrl: initialSeller.shop?.logoUrl ?? '',
        bannerUrl: initialSeller.shop?.bannerUrl ?? '',
      };
    }
    return loadDraft();
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sync formData changes to client-side sessionStorage
  function handleFormChange(patch: Partial<WizardFormData>) {
    setFormData((prev) => {
      const next = { ...prev, ...patch };
      saveDraft(next);
      return next;
    });
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      legalName: formData.legalName.trim(),
      type: formData.type,
      country: formData.country.trim().toUpperCase(),
      shop: {
        displayName: formData.displayName.trim(),
        slug: formData.slug.trim(),
        ...(formData.description.trim() ? { description: formData.description.trim() } : {}),
        ...(formData.logoUrl.trim() ? { logoUrl: formData.logoUrl.trim() } : {}),
        ...(formData.bannerUrl.trim() ? { bannerUrl: formData.bannerUrl.trim() } : {}),
      },
    };

    const endpoint = isResubmission ? '/api/seller/resubmit' : '/api/seller/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const code = json?.error?.code ?? 'INTERNAL';
        const detail = json?.error?.message ?? json?.error?.detail ?? t('defaultSubmitError');
        setSubmitError(`${code}: ${detail}`);
        setIsSubmitting(false);
        return;
      }

      clearDraft();
      router.push(`/${locale}/onboarding/status`);
    } catch {
      setSubmitError(t('networkSubmitError'));
      setIsSubmitting(false);
    }
  }

  const steps = [
    { number: 1, label: t('step1Nav'), icon: ShieldCheck },
    { number: 2, label: t('step2Nav'), icon: Store },
    { number: 3, label: t('step3Nav'), icon: FileText },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4">
      {/* Changes requested banner */}
      {isResubmission && lastReviewNote && <ChangesRequestedAlert note={lastReviewNote} />}

      {/* Step Indicator */}
      <div className="mb-8" data-testid="wizard-step-indicator">
        <div className="flex items-center justify-between">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isCompleted = step > s.number;
            const isCurrent = step === s.number;

            return (
              <div key={s.number} className="flex-1 flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    data-testid={`step-indicator-${s.number}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                      isCompleted
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isCurrent
                          ? 'border-primary bg-background text-primary ring-4 ring-primary/20'
                          : 'border-muted text-muted-foreground bg-muted/30'
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium ${
                      isCurrent
                        ? 'text-foreground font-semibold'
                        : isCompleted
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/60'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>

                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 transition-all ${
                      step > s.number ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {step === 1 && (
          <StepLegal data={formData} onChange={handleFormChange} onNext={() => setStep(2)} />
        )}

        {step === 2 && (
          <StepShop
            data={formData}
            onChange={handleFormChange}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
            initialValidSlug={initialSeller?.shop?.slug}
          />
        )}

        {step === 3 && (
          <StepReview
            data={formData}
            isResubmission={isResubmission}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onGoToStep={(st) => setStep(st)}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  );
}
