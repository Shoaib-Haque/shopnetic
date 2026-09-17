'use client';
import type {
  AddBrandAliasRequest,
  Brand,
  BrandStatus,
  CreateBrandRequest,
  MergeBrandRequest,
  UpdateBrandRequest,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export interface BrandListPage {
  brands: Brand[];
  nextCursor: string | undefined;
}

/** Cursor-paginated — Brand is flat (no tree), so this is the list's only
 * data source, unlike Category which also has an unpaginated tree load. */
export function listBrandsPage(opts: {
  status?: BrandStatus;
  /** Archived (soft-deleted) rows instead of live ones — the only way back
   * to a row once its delete's undo-toast window has passed. */
  archived?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<BrandListPage> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.archived) params.set('archived', 'true');
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminApi<{ data: Brand[]; meta: { nextCursor?: string } }>(
    `/brands${qs ? `?${qs}` : ''}`,
    {
      raw: true,
    },
  ).then((r) => ({ brands: r.data, nextCursor: r.meta.nextCursor }));
}

export function createBrand(body: CreateBrandRequest): Promise<Brand> {
  return adminApi<Brand>('/brands', { method: 'POST', body });
}

export function updateBrand(id: string, body: UpdateBrandRequest): Promise<Brand> {
  return adminApi<Brand>(`/brands/${id}`, { method: 'PATCH', body });
}

export function addBrandAlias(id: string, body: AddBrandAliasRequest): Promise<Brand> {
  return adminApi<Brand>(`/brands/${id}/aliases`, { method: 'POST', body });
}

export function removeBrandAlias(id: string, aliasId: string): Promise<void> {
  return adminApi<void>(`/brands/${id}/aliases/${aliasId}`, { method: 'DELETE' });
}

export function mergeBrand(id: string, body: MergeBrandRequest): Promise<Brand> {
  return adminApi<Brand>(`/brands/${id}/merge`, { method: 'POST', body });
}

export function deleteBrand(id: string): Promise<void> {
  return adminApi<void>(`/brands/${id}`, { method: 'DELETE' });
}

/** Un-archive a soft-deleted brand. */
export function restoreBrand(id: string): Promise<Brand> {
  return adminApi<Brand>(`/brands/${id}/restore`, { method: 'POST' });
}
