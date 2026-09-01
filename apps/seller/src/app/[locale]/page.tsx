import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function SellerHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">{t('appName')}</h1>
      <p className="text-muted-foreground">{t('sellerCenter')}</p>
    </main>
  );
}
