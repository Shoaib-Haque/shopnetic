import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { AcceptInviteForm } from '@/features/staff-auth/components/accept-invite-form';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const metadata: Metadata = {
  title: 'Accept invite',
  robots: { index: false, follow: false },
};

export default async function AcceptInvitePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('staff');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold">{t('accept.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('accept.intro')}</p>
      <AcceptInviteForm token={token ?? null} locale={locale} basePath={ADMIN_BASE_PATH} />
    </main>
  );
}
