import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** Staff login. STUB — the real form + server action land with Identity & Access. */
export default async function AdminLogin({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">{t('signIn')}</h1>
      <p className="text-sm text-muted-foreground">{t('loginStub')}</p>
    </main>
  );
}
