import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';
import { StatusView } from '@/features/onboarding/status-view';

interface OnboardingStatusPageProps {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingStatusPage({ params }: OnboardingStatusPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  if (!actor) {
    redirect(`/${locale}/login?returnTo=/${locale}/onboarding/status`);
  }

  if (!seller) {
    redirect(`/${locale}/onboarding`);
  }

  if (seller.status === 'draft') {
    redirect(`/${locale}/onboarding`);
  }

  return <StatusView seller={seller} locale={locale} />;
}
