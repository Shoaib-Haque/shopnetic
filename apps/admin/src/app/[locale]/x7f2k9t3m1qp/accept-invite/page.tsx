import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-20 sm:pt-28">
      {/* the heading/intro vary by state (form / done / invalid link) — owned
          by the form itself rather than fixed here, so "set a password" can't
          linger once it's already been set */}
      <AcceptInviteForm token={token ?? null} locale={locale} basePath={ADMIN_BASE_PATH} />
    </main>
  );
}
