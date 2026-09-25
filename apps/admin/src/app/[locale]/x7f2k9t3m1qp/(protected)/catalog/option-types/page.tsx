import { setRequestLocale } from 'next-intl/server';
import { OptionTypeList } from '@/features/catalog/option-types/option-type-list';

export default async function OptionTypesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OptionTypeList />;
}
