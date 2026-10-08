'use client';

import type {
  CreateProductRequest,
  CreateVariantRequest,
  Product,
  ProductListStatus,
  ProductOption,
  ProductOrigin,
  PutProductOptionRequest,
  SetProductOptionValuesRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  Variant,
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

// ── Product options (plan/26 §2.2) ──────────────────────────────────────────

export function listProductOptions(productId: string): Promise<ProductOption[]> {
  return adminApi<ProductOption[]>(`/products/${productId}/options`);
}

export function putProductOption(
  productId: string,
  optionTypeId: string,
  body: PutProductOptionRequest,
): Promise<ProductOption> {
  return adminApi<ProductOption>(`/products/${productId}/options/${optionTypeId}`, {
    method: 'PUT',
    body,
  });
}

export function setProductOptionValues(
  productId: string,
  optionTypeId: string,
  body: SetProductOptionValuesRequest,
): Promise<ProductOption> {
  return adminApi<ProductOption>(`/products/${productId}/options/${optionTypeId}/values`, {
    method: 'PUT',
    body,
  });
}

export function deleteProductOption(productId: string, optionTypeId: string): Promise<void> {
  return adminApi<void>(`/products/${productId}/options/${optionTypeId}`, {
    method: 'DELETE',
  });
}

// ── Product variants (plan/26 §2.3) ─────────────────────────────────────────

export function listVariants(productId: string): Promise<Variant[]> {
  return adminApi<Variant[]>(`/products/${productId}/variants`);
}

export function getVariant(productId: string, id: string): Promise<Variant> {
  return adminApi<Variant>(`/products/${productId}/variants/${id}`);
}

export function createVariant(productId: string, body: CreateVariantRequest): Promise<Variant> {
  return adminApi<Variant>(`/products/${productId}/variants`, {
    method: 'POST',
    body,
  });
}

export function updateVariant(
  productId: string,
  id: string,
  body: UpdateVariantRequest,
): Promise<Variant> {
  return adminApi<Variant>(`/products/${productId}/variants/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteVariant(productId: string, id: string): Promise<void> {
  return adminApi<void>(`/products/${productId}/variants/${id}`, {
    method: 'DELETE',
  });
}
