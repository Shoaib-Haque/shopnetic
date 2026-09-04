import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { CategoryForm } from '@/features/catalog/categories/category-form';

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CategoryForm mode="edit" id={id} locale={locale} basePath={ADMIN_BASE_PATH} />;
}
