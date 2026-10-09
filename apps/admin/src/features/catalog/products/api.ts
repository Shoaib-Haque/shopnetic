'use client';

import type {
  Buybox,
  CreateMediaRequest,
  CreateOfferRequest,
  CreateProductRequest,
  CreateVariantRequest,
  CreateWarehouseRequest,
  MediaAsset,
  Offer,
  Product,
  ProductListStatus,
  ProductOption,
  ProductOrigin,
  PutMediaTagRequest,
  PutProductOptionRequest,
  ReorderMediaRequest,
  SellerWithShop,
  SetProductOptionValuesRequest,
  StockLevel,
  UpdateMediaRequest,
  UpdateOfferRequest,
  UpdateProductRequest,
  UpdateStockRequest,
  UpdateVariantRequest,
  Variant,
  Warehouse,
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

// ── Product media (plan/26 §5) ──────────────────────────────────────────────

export function listProductMedia(productId: string): Promise<MediaAsset[]> {
  return adminApi<MediaAsset[]>(`/products/${productId}/media`);
}

export function createProductMedia(
  productId: string,
  body: CreateMediaRequest,
): Promise<MediaAsset> {
  return adminApi<MediaAsset>(`/products/${productId}/media`, {
    method: 'POST',
    body,
  });
}

export function updateMedia(id: string, body: UpdateMediaRequest): Promise<MediaAsset> {
  return adminApi<MediaAsset>(`/media/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteMedia(id: string): Promise<void> {
  return adminApi<void>(`/media/${id}`, {
    method: 'DELETE',
  });
}

export function putMediaTag(
  id: string,
  optionTypeId: string,
  body: PutMediaTagRequest,
): Promise<MediaAsset> {
  return adminApi<MediaAsset>(`/media/${id}/tags/${optionTypeId}`, {
    method: 'PUT',
    body,
  });
}

export function deleteMediaTag(id: string, optionTypeId: string): Promise<void> {
  return adminApi<void>(`/media/${id}/tags/${optionTypeId}`, {
    method: 'DELETE',
  });
}

export function reorderProductMedia(
  productId: string,
  body: ReorderMediaRequest,
): Promise<MediaAsset[]> {
  return adminApi<MediaAsset[]>(`/products/${productId}/media/reorder`, {
    method: 'PUT',
    body,
  });
}

// ── Offers & Inventory (plan/26 §6, plan/07) ────────────────────────────────

export function listProductOffers(productId: string): Promise<Offer[]> {
  return adminApi<Offer[]>(`/offers?productId=${productId}`);
}

export function listVariantOffers(variantId: string): Promise<Offer[]> {
  return adminApi<Offer[]>(`/offers?variantId=${variantId}`);
}

export function getVariantBuybox(variantId: string): Promise<Buybox | null> {
  return adminApi<Buybox | null>(`/offers/variants/${variantId}/buybox`);
}

export function createOffer(body: CreateOfferRequest): Promise<Offer> {
  return adminApi<Offer>('/offers', { method: 'POST', body });
}

export function updateOffer(id: string, body: UpdateOfferRequest): Promise<Offer> {
  return adminApi<Offer>(`/offers/${id}`, { method: 'PATCH', body });
}

export function deleteOffer(id: string): Promise<void> {
  return adminApi<void>(`/offers/${id}`, { method: 'DELETE' });
}

export function restoreOffer(id: string): Promise<Offer> {
  return adminApi<Offer>(`/offers/${id}/restore`, { method: 'POST' });
}

export function updateStock(
  offerId: string,
  warehouseId: string,
  body: UpdateStockRequest,
): Promise<StockLevel> {
  return adminApi<StockLevel>(`/offers/${offerId}/stock/${warehouseId}`, {
    method: 'PUT',
    body,
  });
}

export function listWarehouses(sellerId?: string): Promise<Warehouse[]> {
  const qs = sellerId ? `?sellerId=${sellerId}` : '';
  return adminApi<Warehouse[]>(`/warehouses${qs}`);
}

export function createWarehouse(body: CreateWarehouseRequest): Promise<Warehouse> {
  return adminApi<Warehouse>('/warehouses', { method: 'POST', body });
}

export function listSellers(): Promise<SellerWithShop[]> {
  return adminApi<SellerWithShop[]>('/sellers');
}
