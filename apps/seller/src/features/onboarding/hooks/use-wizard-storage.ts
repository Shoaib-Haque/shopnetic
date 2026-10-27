'use client';

import { useCallback } from 'react';

export interface WizardFormData {
  legalName: string;
  type: 'individual' | 'business';
  country: string;
  displayName: string;
  slug: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
}

export const INITIAL_WIZARD_DATA: WizardFormData = {
  legalName: '',
  type: 'business',
  country: '',
  displayName: '',
  slug: '',
  description: '',
  logoUrl: '',
  bannerUrl: '',
};

export function useWizardStorage(accountId: string) {
  const storageKey = `shopnetic_seller_onboarding_${accountId}`;

  const loadDraft = useCallback((): WizardFormData => {
    if (typeof window === 'undefined') return INITIAL_WIZARD_DATA;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        return { ...INITIAL_WIZARD_DATA, ...JSON.parse(saved) };
      }
    } catch {
      // sessionStorage failure fallback
    }
    return INITIAL_WIZARD_DATA;
  }, [storageKey]);

  const saveDraft = useCallback(
    (data: Partial<WizardFormData>) => {
      if (typeof window === 'undefined') return;
      try {
        const current = loadDraft();
        const merged = { ...current, ...data };
        sessionStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Ignore quota/access errors
      }
    },
    [storageKey, loadDraft],
  );

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }, [storageKey]);

  return { loadDraft, saveDraft, clearDraft };
}
