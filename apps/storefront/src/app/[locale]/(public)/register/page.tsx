import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/features/auth/components/register-form';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('register.title'), robots: { index: false, follow: true } };
}

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <main className="flex flex-col items-start gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('register.title')}</h1>
      <RegisterForm />
      <p className="text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link href={`/${locale}/login`} className="font-medium underline">
          {t('register.loginLink')}
        </Link>
      </p>
    </main>
  );
}
