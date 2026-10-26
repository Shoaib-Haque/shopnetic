'use client';

import type { SellerStatus, SellerWithShop, UpdateSellerStatusRequest } from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export interface SellerListPage {
  sellers: SellerWithShop[];
  nextCursor: string | undefined;
}

/**
 * Cursor-paginated seller list from the BFF proxy (`/api/admin/sellers`).
 */
export function listSellersPage(
  opts: {
    status?: SellerStatus | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
    q?: string | undefined;
  } = {},
): Promise<SellerListPage> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.q) params.set('q', opts.q);
  const qs = params.toString();
  return adminApi<{ data: SellerWithShop[]; meta: { nextCursor?: string } }>(
    `/sellers${qs ? `?${qs}` : ''}`,
    {
      raw: true,
    },
  ).then((r) => ({ sellers: r.data, nextCursor: r.meta.nextCursor }));
}

/**
 * Fetch a single seller with shop and resolved account email by id.
 */
export function getSeller(id: string): Promise<SellerWithShop> {
  return adminApi<SellerWithShop>(`/sellers/${id}`, { priority: 'high' });
}

/**
 * Moderate seller status with expectedUpdatedAt for OCC.
 */
export function updateSellerStatus(
  id: string,
  body: UpdateSellerStatusRequest,
): Promise<SellerWithShop> {
  return adminApi<SellerWithShop>(`/sellers/${id}/status`, {
    method: 'PATCH',
    body,
  });
}
