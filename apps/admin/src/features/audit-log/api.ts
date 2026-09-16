'use client';

import type { AuditEvent, AuditEventsMeta } from '@shopnetic/contracts';
import { auditLogApi } from '@/features/admin-api/client';

export interface AuditEventsPage {
  events: AuditEvent[];
  nextCursor: string | undefined;
}

export type AuditDomain = 'catalog' | 'identity';

export interface AuditEventsFilters {
  q?: string;
  domain?: AuditDomain;
  targetType?: string;
  /** `YYYY-MM-DD` — inclusive of the whole day on both ends. */
  from?: string;
  to?: string;
}

const PAGE_SIZE = 25;

export function listAuditEvents(
  cursor?: string,
  filters: AuditEventsFilters = {},
): Promise<AuditEventsPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  if (filters.q) params.set('q', filters.q);
  if (filters.domain) params.set('domain', filters.domain);
  if (filters.targetType) params.set('targetType', filters.targetType);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return auditLogApi<{ data: AuditEvent[]; meta: AuditEventsMeta }>(`?${params}`, {
    raw: true,
  }).then((r) => ({ events: r.data, nextCursor: r.meta.nextCursor }));
}
