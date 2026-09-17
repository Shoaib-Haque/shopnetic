import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { redirectIfSignedIn } from '@/features/staff-auth/redirect-if-signed-in';
import { StaffLoginForm } from '@/features/staff-auth/components/login-form';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function AdminLoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await redirectIfSignedIn(locale);
  const { next } = await searchParams;

  const t = await getTranslations('staff');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold">{t('login.title')}</h1>
      <StaffLoginForm locale={locale} basePath={ADMIN_BASE_PATH} next={next ?? null} />
    </main>
  );
}
