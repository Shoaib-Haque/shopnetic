'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { SessionUser } from '@shopnetic/contracts';
import { LogoutButton } from './logout-button';

type State = { status: 'loading' } | { status: 'anon' } | { status: 'user'; user: SessionUser };

/**
 * Per-viewer sign-in state. A client island so the page it sits on stays
 * static/ISR (plan/CODING-RULES.md §C5) — this is not indexable content.
 */
export function AuthStrip({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session')
      .then((r) => r.json())
      .then((body: { data?: { user?: SessionUser | null } }) => {
        if (!active) return;
        const user = body.data?.user ?? null;
        setState(user ? { status: 'user', user } : { status: 'anon' });
      })
      .catch(() => active && setState({ status: 'anon' }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex min-h-8 w-full items-center justify-between gap-4 text-sm">
      {state.status === 'loading' ? (
        <span className="h-4 w-40 animate-pulse rounded bg-muted" aria-hidden />
      ) : state.status === 'user' ? (
        <>
          <span className="text-muted-foreground">
            {t('signedInAs', { email: state.user.email })}
          </span>
          <LogoutButton />
        </>
      ) : (
        <span className="flex gap-3">
          <Link href={`/${locale}/login`} className="font-medium underline">
            {t('login.submit')}
          </Link>
          <Link href={`/${locale}/register`} className="font-medium underline">
            {t('register.submit')}
          </Link>
        </span>
      )}
    </div>
  );
}
