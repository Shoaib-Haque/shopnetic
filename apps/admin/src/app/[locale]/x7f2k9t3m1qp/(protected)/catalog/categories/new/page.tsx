import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { CategoryForm } from '@/features/catalog/categories/category-form';

export default async function NewCategoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CategoryForm mode="create" locale={locale} basePath={ADMIN_BASE_PATH} />;
}
