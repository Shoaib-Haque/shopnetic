import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { redirectIfSignedIn } from '@/features/staff-auth/redirect-if-signed-in';
import { ForgotPasswordForm } from '@/features/staff-auth/components/forgot-password-form';

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await redirectIfSignedIn(locale);

  return (
    // neutral shell — vertical alignment is chosen per state (form vs
    // message) inside the form itself, via AuthPageSection
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4">
      <ForgotPasswordForm locale={locale} basePath={ADMIN_BASE_PATH} />
    </main>
  );
}
