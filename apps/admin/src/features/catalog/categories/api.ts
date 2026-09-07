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

export function listCategories(opts?: { status?: CategoryListStatus }): Promise<Category[]> {
  const status = opts?.status ?? 'active';
  const q = status === 'active' ? '' : `?status=${status}`;
  return adminApi<Category[]>(`/categories${q}`);
}

export function getCategory(id: string): Promise<Category> {
  return adminApi<Category>(`/categories/${id}`);
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
