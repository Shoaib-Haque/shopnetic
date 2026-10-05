'use client';

import type { AuditEvent, AuditEventsMeta } from '@shopnetic/contracts';
import { auditLogApi } from '@/features/admin-api/client';

export interface AuditEventsPage {
  events: AuditEvent[];
  nextCursor: string | undefined;
}

export type AuditDomain = 'catalog' | 'identity';

export interface AuditEventsFilters {
  q?: string | undefined;
  domain?: AuditDomain | undefined;
  targetType?: string | undefined;
  /** `YYYY-MM-DD` — inclusive of the whole day on both ends. */
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

const DEFAULT_PAGE_SIZE = 30;

export function listAuditEvents(opts?: AuditEventsFilters): Promise<AuditEventsPage>;
export function listAuditEvents(
  cursor?: string,
  filters?: AuditEventsFilters,
): Promise<AuditEventsPage>;
export function listAuditEvents(
  cursorOrOpts?: string | AuditEventsFilters,
  maybeFilters?: AuditEventsFilters,
): Promise<AuditEventsPage> {
  const opts: AuditEventsFilters =
    typeof cursorOrOpts === 'object' && cursorOrOpts !== null
      ? cursorOrOpts
      : { cursor: cursorOrOpts, ...maybeFilters };

  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.q) params.set('q', opts.q);
  if (opts.domain) params.set('domain', opts.domain);
  if (opts.targetType) params.set('targetType', opts.targetType);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  return auditLogApi<{ data: AuditEvent[]; meta: AuditEventsMeta }>(`?${params}`, {
    raw: true,
  }).then((r) => ({ events: r.data, nextCursor: r.meta.nextCursor }));
}
