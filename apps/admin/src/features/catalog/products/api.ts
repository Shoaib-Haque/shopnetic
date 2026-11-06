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
  PosterCandidatesResponse,
  Product,
  ProductListStatus,
  ProductOption,
  ProductOrigin,
  PutMediaTagRequest,
  PutProductOptionRequest,
  ReorderMediaRequest,
  RequestUploadUrlRequest,
  SellerWithShop,
  SetProductOptionValuesRequest,
  StockLevel,
  UpdateMediaRequest,
  UpdateOfferRequest,
  UpdateProductRequest,
  UpdateStockRequest,
  UpdateVariantRequest,
  UploadUrlResponse,
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

export async function listVariantsPage(
  productId: string,
  opts?: {
    status?: 'active' | 'inactive' | 'all';
    q?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ variants: Variant[]; nextCursor?: string | undefined; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status && opts.status !== 'all') params.set('status', opts.status);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.cursor) params.set('cursor', opts.cursor);
  params.set('limit', String(opts?.limit ?? 30));

  const queryStr = params.toString();
  const path = `/products/${productId}/variants${queryStr ? `?${queryStr}` : ''}`;
  const res = await adminApi<{ data: Variant[]; meta: { nextCursor?: string; total?: number } }>(
    path,
    { raw: true },
  );
  return {
    variants: res.data,
    ...(res.meta.nextCursor ? { nextCursor: res.meta.nextCursor } : {}),
    total: res.meta.total ?? res.data.length,
  };
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

export function restoreVariant(productId: string, id: string): Promise<Variant> {
  return adminApi<Variant>(`/products/${productId}/variants/${id}/restore`, {
    method: 'POST',
  });
}

// ── Product media (plan/26 §5) ──────────────────────────────────────────────

export function requestUploadUrl(body: RequestUploadUrlRequest): Promise<UploadUrlResponse> {
  return adminApi<UploadUrlResponse>('/media/upload-url', {
    method: 'POST',
    body,
  });
}

export function generatePosterCandidatesApi(fileKey: string): Promise<PosterCandidatesResponse> {
  return adminApi<PosterCandidatesResponse>('/media/poster-candidates', {
    method: 'POST',
    body: { fileKey },
  });
}

export function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.round((evt.loaded / evt.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(file);
  });
}

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

export function abortUpload(fileKey: string): Promise<void> {
  return adminApi<void>('/media/upload-abort', {
    method: 'POST',
    body: { fileKey },
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

export interface OfferListPage {
  offers: Offer[];
  nextCursor: string | undefined;
  total: number;
}

export function listOffersPage(opts: {
  productId?: string | undefined;
  variantId?: string | undefined;
  sellerId?: string | undefined;
  status?: 'active' | 'all' | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}): Promise<OfferListPage> {
  const params = new URLSearchParams();
  if (opts.productId) params.set('productId', opts.productId);
  if (opts.variantId) params.set('variantId', opts.variantId);
  if (opts.sellerId) params.set('sellerId', opts.sellerId);
  if (opts.status) params.set('status', opts.status);
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminApi<{ data: Offer[]; meta: { nextCursor?: string; total?: number } }>(
    `/offers${qs ? `?${qs}` : ''}`,
    { raw: true },
  ).then((r) => ({
    offers: r.data,
    nextCursor: r.meta.nextCursor,
    total: r.meta.total ?? r.data.length,
  }));
}

export function getVariantOfferCounts(productId: string): Promise<Record<string, number>> {
  return adminApi<Record<string, number>>(`/offers/products/${productId}/counts`);
}

export function listProductOffers(productId: string): Promise<Offer[]> {
  return adminApi<Offer[]>(`/offers?productId=${productId}`);
}

export function listVariantOffers(variantId: string): Promise<Offer[]> {
  return adminApi<Offer[]>(`/offers?variantId=${variantId}`);
}

export function countVariantOffers(variantId: string): Promise<number> {
  return adminApi<{ data: Offer[]; meta: { total?: number } }>(
    `/offers?variantId=${encodeURIComponent(variantId)}&status=all&limit=1`,
    { raw: true },
  ).then((r) => r.meta.total ?? r.data.length);
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

export function getSeller(id: string): Promise<SellerWithShop> {
  return adminApi<SellerWithShop>(`/sellers/${id}`);
}
