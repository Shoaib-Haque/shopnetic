import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { redirectIfSignedIn } from '@/features/staff-auth/redirect-if-signed-in';
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
  // a signed-in visitor clicking an invite link (often in the same browser
  // that sent it) must not silently accept it into their own session — see
  // redirectIfSignedIn's doc comment.
  await redirectIfSignedIn(locale);
  const { token } = await searchParams;

  return (
    // neutral shell — vertical alignment is chosen per state (form vs
    // message) inside the form itself, via AuthPageSection
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4">
      {/* the heading/intro vary by state (form / done / invalid link) — owned
          by the form itself rather than fixed here, so "set a password" can't
          linger once it's already been set */}
      <AcceptInviteForm token={token ?? null} locale={locale} basePath={ADMIN_BASE_PATH} />
    </main>
  );
}
