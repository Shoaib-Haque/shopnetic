'use client';
import type {
  Category,
  CategoryListStatus,
  CreateCategoryRequest,
  MoveCategoryRequest,
  ReorderCategoriesRequest,
  UpdateCategoryRequest,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

/** The active tree's own load — every matching row in one shot, `path,
 * position` order. Unchanged shape/behavior; a tree can't render a page
 * boundary without either breaking the hierarchy or prefetching ancestors,
 * so it never paginates (see `listCategoriesPage` for the flat views). */
export function listCategories(opts?: { status?: CategoryListStatus }): Promise<Category[]> {
  const status = opts?.status ?? 'active';
  const q = status === 'active' ? '' : `?status=${status}`;
  return adminApi<Category[]>(`/categories${q}`);
}

export interface CategoryListPage {
  categories: Category[];
  nextCursor: string | undefined;
}

/** Cursor-paginated — the flat Archived/All views and any search (which is
 * server-side, replicating `@/lib/search`'s token/OR/score matching, so a
 * query covers the whole table rather than just whatever page is loaded). */
export function listCategoriesPage(opts: {
  status?: CategoryListStatus;
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<CategoryListPage> {
  const params = new URLSearchParams();
  const status = opts.status ?? 'active';
  if (status !== 'active') params.set('status', status);
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminApi<{ data: Category[]; meta: { nextCursor?: string } }>(
    `/categories${qs ? `?${qs}` : ''}`,
    { raw: true },
  ).then((r) => ({ categories: r.data, nextCursor: r.meta.nextCursor }));
}

export function createCategory(body: CreateCategoryRequest): Promise<Category> {
  return adminApi<Category>('/categories', { method: 'POST', body });
}

/** Pass `parentId` in `body` to reparent in the same call. */
export function updateCategory(id: string, body: UpdateCategoryRequest): Promise<Category> {
  return adminApi<Category>(`/categories/${id}`, { method: 'PATCH', body });
}

export function moveCategory(id: string, body: MoveCategoryRequest): Promise<Category> {
  return adminApi<Category>(`/categories/${id}/move`, { method: 'POST', body });
}

/** Drag-reorder: `orderedIds` becomes the exact child list of `parentId`. */
export function reorderCategories(body: ReorderCategoriesRequest): Promise<Category[]> {
  return adminApi<Category[]>('/categories/reorder', { method: 'POST', body });
}

export function deleteCategory(id: string): Promise<void> {
  return adminApi<void>(`/categories/${id}`, { method: 'DELETE' });
}

/** Un-archive a category and its archived subtree (cascade). */
export function restoreCategory(id: string): Promise<Category> {
  return adminApi<Category>(`/categories/${id}/restore`, { method: 'POST' });
}
