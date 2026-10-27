import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';
import { ShopSettingsForm } from '@/features/shop/shop-settings-form';

interface ShopSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ShopSettingsPage({ params }: ShopSettingsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  if (!actor) {
    redirect(`/${locale}/login?returnTo=/${locale}/settings/shop`);
  }

  if (!seller || !seller.shop) {
    redirect(`/${locale}/onboarding`);
  }

  if (seller.status !== 'approved') {
    redirect(`/${locale}/onboarding/status`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <ShopSettingsForm initialShop={seller.shop} locale={locale} />
    </div>
  );
}
