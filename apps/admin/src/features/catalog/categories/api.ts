'use client';
import type {
  Category,
  CreateCategoryRequest,
  MoveCategoryRequest,
  UpdateCategoryRequest,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export function listCategories(opts?: { includeInactive?: boolean }): Promise<Category[]> {
  const q = opts?.includeInactive ? '?includeInactive=true' : '';
  return adminApi<Category[]>(`/categories${q}`);
}

export function getCategory(id: string): Promise<Category> {
  return adminApi<Category>(`/categories/${id}`);
}

export function createCategory(body: CreateCategoryRequest): Promise<Category> {
  return adminApi<Category>('/categories', { method: 'POST', body });
}

export function updateCategory(id: string, body: UpdateCategoryRequest): Promise<Category> {
  return adminApi<Category>(`/categories/${id}`, { method: 'PATCH', body });
}

export function moveCategory(id: string, body: MoveCategoryRequest): Promise<Category> {
  return adminApi<Category>(`/categories/${id}/move`, { method: 'POST', body });
}

export function deleteCategory(id: string): Promise<void> {
  return adminApi<void>(`/categories/${id}`, { method: 'DELETE' });
}
