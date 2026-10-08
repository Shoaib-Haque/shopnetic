import { setRequestLocale } from 'next-intl/server';
import { ProductList } from '@/features/catalog/products/product-list';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProductList />;
}
