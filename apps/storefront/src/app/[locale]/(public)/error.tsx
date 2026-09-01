'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@shopnetic/ui';

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="text-xl font-semibold">{t('errorTitle')}</h2>
      <p className="text-muted-foreground">{t('errorBody')}</p>
      <Button variant="outline" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
