import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { VerifyEmailStatus } from '@/features/auth/components/verify-email-status';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('verify.title'), robots: { index: false, follow: false } };
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <main className="flex flex-col items-start gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('verify.title')}</h1>
      <VerifyEmailStatus token={token ?? null} locale={locale} />
    </main>
  );
}
