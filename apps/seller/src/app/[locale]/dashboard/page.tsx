import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';
import { DashboardView } from '@/features/shop/dashboard-view';

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  if (!actor) {
    redirect(`/${locale}/login?returnTo=/${locale}/dashboard`);
  }

  if (!seller) {
    redirect(`/${locale}/onboarding`);
  }

  if (seller.status !== 'approved') {
    redirect(`/${locale}/onboarding/status`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <DashboardView seller={seller} locale={locale} />
    </div>
  );
}
