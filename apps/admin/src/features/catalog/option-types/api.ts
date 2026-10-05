'use client';
import type {
  AddOptionValueRequest,
  CreateOptionTypeRequest,
  OptionStatus,
  OptionType,
  UpdateOptionTypeRequest,
  UpdateOptionValueRequest,
} from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export interface OptionTypeListPage {
  optionTypes: OptionType[];
  nextCursor: string | undefined;
}

/** Cursor-paginated, same shape as Brand — option types were assumed to
 * stay a small, bounded set, but 70+ real ones later proved otherwise. */
export function listOptionTypesPage(opts: {
  status?: OptionStatus;
  /** Archived (soft-deleted) rows instead of live ones — the only way back
   * to a row once its delete's undo-toast window has passed. */
  archived?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<OptionTypeListPage> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.archived) params.set('archived', 'true');
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return adminApi<{ data: OptionType[]; meta: { nextCursor?: string } }>(
    `/option-types${qs ? `?${qs}` : ''}`,
    { raw: true },
  ).then((r) => ({ optionTypes: r.data, nextCursor: r.meta.nextCursor }));
}

/** One record by id, regardless of live/archived — for a deep link's
 * direct-by-id lookup (`useHighlightTarget`), not the paginated list. */
export function getOptionType(id: string): Promise<OptionType> {
  return adminApi<OptionType>(`/option-types/${id}`, { priority: 'high' });
}

export function createOptionType(body: CreateOptionTypeRequest): Promise<OptionType> {
  return adminApi<OptionType>('/option-types', { method: 'POST', body });
}

export function updateOptionType(id: string, body: UpdateOptionTypeRequest): Promise<OptionType> {
  return adminApi<OptionType>(`/option-types/${id}`, { method: 'PATCH', body });
}

/** Soft delete — undo-toast + `restoreOptionType` window, then the Archived
 * tab after that (matches Brand/Category). */
export function deleteOptionType(id: string): Promise<void> {
  return adminApi<void>(`/option-types/${id}`, { method: 'DELETE' });
}

export function restoreOptionType(id: string): Promise<OptionType> {
  return adminApi<OptionType>(`/option-types/${id}/restore`, { method: 'POST' });
}

export function addOptionValue(id: string, body: AddOptionValueRequest): Promise<OptionType> {
  return adminApi<OptionType>(`/option-types/${id}/values`, { method: 'POST', body });
}

export function updateOptionValue(
  id: string,
  valueId: string,
  body: UpdateOptionValueRequest,
): Promise<OptionType> {
  return adminApi<OptionType>(`/option-types/${id}/values/${valueId}`, {
    method: 'PATCH',
    body,
  });
}

export function removeOptionValue(id: string, valueId: string): Promise<void> {
  return adminApi<void>(`/option-types/${id}/values/${valueId}`, { method: 'DELETE' });
}
