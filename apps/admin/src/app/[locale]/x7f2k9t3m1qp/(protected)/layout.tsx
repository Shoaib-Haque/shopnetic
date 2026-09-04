import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import { LogoutButton } from '@/features/staff-auth/components/logout-button';

/**
 * Protected admin shell. Server Component: no valid staff session → redirect to
 * the login page (plan/23 §3). Nav from the actor's permissions lands with the
 * first back-office module.
 */
export default async function ProtectedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const staff = await getCurrentStaff();
  if (!staff) redirect(`/${locale}/${ADMIN_BASE_PATH}/login`);

  const [t, tc] = await Promise.all([getTranslations('staff'), getTranslations('catalog')]);
  const root = `/${locale}/${ADMIN_BASE_PATH}`;
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 text-sm">
        <span className="flex items-center gap-6">
          <span className="font-semibold">{t('shell.appName')}</span>
          <nav className="flex items-center gap-4 text-muted-foreground">
            <Link href={root} className="hover:text-foreground">
              {tc('nav.dashboard')}
            </Link>
            <Link href={`${root}/catalog/categories`} className="hover:text-foreground">
              {tc('nav.categories')}
            </Link>
          </nav>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-muted-foreground">{staff.email}</span>
          <LogoutButton />
        </span>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
