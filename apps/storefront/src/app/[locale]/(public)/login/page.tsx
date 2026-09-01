import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/features/auth/components/login-form';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('login.title'), robots: { index: false, follow: true } };
}

export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <main className="flex flex-col items-start gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h1>
      <LoginForm locale={locale} />
      <p className="text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href={`/${locale}/register`} className="font-medium underline">
          {t('login.registerLink')}
        </Link>
      </p>
    </main>
  );
}
