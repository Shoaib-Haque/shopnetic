import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import { StaffLoginForm } from '@/features/staff-auth/components/login-form';

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function AdminLoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await getCurrentStaff()) redirect(`/${locale}/${ADMIN_BASE_PATH}`);

  const t = await getTranslations('staff');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold">{t('login.title')}</h1>
      <StaffLoginForm locale={locale} basePath={ADMIN_BASE_PATH} />
    </main>
  );
}
