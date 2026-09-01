'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@shopnetic/ui';
import { postJson } from '../submit';

export function LogoutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      loadingText={t('logout.submitting')}
      onClick={async () => {
        setBusy(true);
        await postJson('/api/auth/logout', {});
        router.refresh();
      }}
    >
      {t('logout.submit')}
    </Button>
  );
}
