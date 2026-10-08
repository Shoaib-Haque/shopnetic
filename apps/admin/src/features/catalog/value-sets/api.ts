'use client';

import type {
  AddValueSetItemRequest,
  CreateValueSetRequest,
  ReorderValueSetItemsRequest,
  UpdateValueSetRequest,
  ValueSet,
  ValueSetListStatus,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export function listValueSets(opts?: {
  status?: ValueSetListStatus;
  optionTypeId?: string;
  q?: string;
}): Promise<ValueSet[]> {
  const params = new URLSearchParams();
  if (opts?.status && opts.status !== 'active') {
    params.set('status', opts.status);
  }
  if (opts?.optionTypeId) {
    params.set('optionTypeId', opts.optionTypeId);
  }
  if (opts?.q) {
    params.set('q', opts.q);
  }
  const qs = params.toString();
  return adminApi<ValueSet[]>(`/value-sets${qs ? `?${qs}` : ''}`);
}

export function getValueSet(id: string): Promise<ValueSet> {
  return adminApi<ValueSet>(`/value-sets/${id}`, { priority: 'high' });
}

export function createValueSet(body: CreateValueSetRequest): Promise<ValueSet> {
  return adminApi<ValueSet>('/value-sets', { method: 'POST', body });
}

export function updateValueSet(id: string, body: UpdateValueSetRequest): Promise<ValueSet> {
  return adminApi<ValueSet>(`/value-sets/${id}`, { method: 'PATCH', body });
}

export function deleteValueSet(id: string): Promise<void> {
  return adminApi<void>(`/value-sets/${id}`, { method: 'DELETE' });
}

export function restoreValueSet(id: string): Promise<ValueSet> {
  return adminApi<ValueSet>(`/value-sets/${id}/restore`, { method: 'POST' });
}

export function addValueSetItem(id: string, body: AddValueSetItemRequest): Promise<ValueSet> {
  return adminApi<ValueSet>(`/value-sets/${id}/items`, { method: 'POST', body });
}

export function removeValueSetItem(id: string, optionValueId: string): Promise<void> {
  return adminApi<void>(`/value-sets/${id}/items/${optionValueId}`, { method: 'DELETE' });
}

export function reorderValueSetItems(
  id: string,
  body: ReorderValueSetItemsRequest,
): Promise<ValueSet> {
  return adminApi<ValueSet>(`/value-sets/${id}/items/reorder`, { method: 'POST', body });
}
