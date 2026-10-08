import { setRequestLocale } from 'next-intl/server';
import { ValueSetList } from '@/features/catalog/value-sets/value-set-list';

export default async function ValueSetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ValueSetList />;
}
