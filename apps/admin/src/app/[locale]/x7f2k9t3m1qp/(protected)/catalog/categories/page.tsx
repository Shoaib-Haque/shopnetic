import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { CategoryList } from '@/features/catalog/categories/category-list';

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CategoryList locale={locale} basePath={ADMIN_BASE_PATH} />;
}
