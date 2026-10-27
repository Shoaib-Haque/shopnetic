'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';

interface ChangesRequestedAlertProps {
  note: string;
}

export function ChangesRequestedAlert({ note }: ChangesRequestedAlertProps) {
  const t = useTranslations('onboarding');

  return (
    <div
      role="alert"
      data-testid="changes-requested-banner"
      className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
            {t('changesRequestedTitle')}
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-200/90">
            {t('changesRequestedDescription')}
          </p>
          <div className="mt-2 rounded bg-amber-100/80 px-3 py-2 font-mono text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {note}
          </div>
        </div>
      </div>
    </div>
  );
}
