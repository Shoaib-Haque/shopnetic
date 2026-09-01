import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminDashboard({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t('dashboard')}</h1>
      <p className="text-muted-foreground">{t('dashboardStub')}</p>
    </main>
  );
}
