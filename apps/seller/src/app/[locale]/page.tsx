import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';

interface SellerPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SellerRootPage({ params }: SellerPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  if (!actor) {
    redirect(`/${locale}/login`);
  }

  if (!seller) {
    redirect(`/${locale}/onboarding`);
  }

  if (seller.status === 'approved') {
    redirect(`/${locale}/dashboard`);
  }

  if (seller.status === 'draft') {
    redirect(`/${locale}/onboarding`);
  }

  // in_review, closed, suspended, offboarding
  redirect(`/${locale}/onboarding/status`);
}
