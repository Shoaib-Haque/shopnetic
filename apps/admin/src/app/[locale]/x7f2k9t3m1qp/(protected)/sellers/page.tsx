import { setRequestLocale } from 'next-intl/server';
import { SellerList } from '@/features/sellers';

export default async function SellersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SellerList locale={locale} />;
}
