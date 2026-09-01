'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Spinner } from '@shopnetic/ui';
import { postJson } from '../submit';
import { authErrorKey, extractErrorCode } from '../error-copy';
import { ResendVerification } from './resend-verification';

type State = 'checking' | 'ok' | 'failed';

/**
 * Fires the verification call once on mount (the token arrived via the email
 * link) and reports the outcome. Leaf client component; the page stays a Server
 * Component (plan/CODING-RULES.md §C1).
 */
export function VerifyEmailStatus({ token, locale }: { token: string | null; locale: string }) {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>(token ? 'checking' : 'failed');
  const [errorKey, setErrorKey] = useState('errors.verificationInvalid');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    void postJson('/api/auth/verify', { token }).then((res) => {
      if (res.status === 200) {
        setState('ok');
        return;
      }
      setErrorKey(authErrorKey(extractErrorCode(res.body)));
      setState('failed');
    });
  }, [token]);

  if (state === 'checking') {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5" />
        {t('verify.checking')}
      </div>
    );
  }

  if (state === 'ok') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">{t('verify.success')}</p>
        <Link href={`/${locale}/login`} className="text-sm font-medium underline">
          {t('verify.goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-destructive" role="alert">
        {t(errorKey)}
      </p>
      <p className="text-sm text-muted-foreground">{t('verify.resendPrompt')}</p>
      <ResendVerification />
    </div>
  );
}
