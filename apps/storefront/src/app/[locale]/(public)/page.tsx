import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { BrowseButton } from '@/features/home/components/browse-button';
import { AuthStrip } from '@/features/auth/components/auth-strip';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: safeLocale, namespace: 'common' });
  return {
    title: t('appName'),
    description: t('tagline'),
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main className="flex flex-col items-start gap-6">
      {/* Per-viewer auth state — a client island so this page stays static (plan/10, CODING-RULES section C5). */}
      <AuthStrip locale={locale} />

      <h1 className="text-3xl font-semibold tracking-tight">{t('appName')}</h1>
      <p className="max-w-prose text-muted-foreground">{t('tagline')}</p>
      <BrowseButton label={t('browse')} />
    </main>
  );
}
