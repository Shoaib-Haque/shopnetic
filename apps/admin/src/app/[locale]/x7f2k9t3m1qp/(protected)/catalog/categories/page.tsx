import { setRequestLocale } from 'next-intl/server';
import { CategoryList } from '@/features/catalog/categories/category-list';

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CategoryList />;
}
