'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const t = useTranslations('common');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    if (!navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      data-testid="offline-banner"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-md backdrop-blur-md dark:text-amber-200"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{t('offlineMessage')}</span>
    </div>
  );
}
