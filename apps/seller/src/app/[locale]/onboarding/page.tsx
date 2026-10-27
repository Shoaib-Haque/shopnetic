import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';
import { OnboardingWizard } from '@/features/onboarding/onboarding-wizard';

interface OnboardingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  if (!actor) {
    redirect(`/${locale}/login?returnTo=/${locale}/onboarding`);
  }

  if (seller?.status === 'approved') {
    redirect(`/${locale}/dashboard`);
  }

  if (seller && seller.status !== 'draft') {
    // in_review, closed, suspended, offboarding
    redirect(`/${locale}/onboarding/status`);
  }

  return <OnboardingWizard accountId={actor.id} initialSeller={seller} locale={locale} />;
}
