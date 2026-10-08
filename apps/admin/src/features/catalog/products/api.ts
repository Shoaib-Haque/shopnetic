'use client';

import type {
  CreateProductRequest,
  Product,
  ProductListStatus,
  ProductOrigin,
  UpdateProductRequest,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export interface ProductListPage {
  products: Product[];
  nextCursor: string | undefined;
}

export function listProductsPage(opts: {
  status?: ProductListStatus | undefined;
  origin?: ProductOrigin | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}): Promise<ProductListPage> {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  else if (opts.status === 'all') params.set('status', 'all');
  if (opts.origin && opts.origin !== 'all') params.set('origin', opts.origin);
  if (opts.categoryId) params.set('categoryId', opts.categoryId);
  if (opts.brandId) params.set('brandId', opts.brandId);
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminApi<{ data: Product[]; meta: { nextCursor?: string } }>(
    `/products${qs ? `?${qs}` : ''}`,
    { raw: true },
  ).then((r) => ({ products: r.data, nextCursor: r.meta.nextCursor }));
}

/** One record by id, regardless of live/archived — for deep link lookup (`useHighlightTarget`). */
export function getProduct(id: string): Promise<Product> {
  return adminApi<Product>(`/products/${id}`, { priority: 'high' });
}

export function createProduct(body: CreateProductRequest): Promise<Product> {
  return adminApi<Product>('/products', { method: 'POST', body });
}

export function updateProduct(id: string, body: UpdateProductRequest): Promise<Product> {
  return adminApi<Product>(`/products/${id}`, { method: 'PATCH', body });
}

export function deleteProduct(id: string): Promise<void> {
  return adminApi<void>(`/products/${id}`, { method: 'DELETE' });
}

export function restoreProduct(id: string): Promise<Product> {
  return adminApi<Product>(`/products/${id}/restore`, { method: 'POST' });
}
