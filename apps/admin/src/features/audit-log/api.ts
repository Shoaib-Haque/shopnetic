'use client';

import type { AuditEvent, AuditEventsMeta } from '@shopnetic/contracts';
import { auditLogApi } from '@/features/admin-api/client';

export interface AuditEventsPage {
  events: AuditEvent[];
  nextCursor: string | undefined;
}

const PAGE_SIZE = 25;

export function listAuditEvents(cursor?: string): Promise<AuditEventsPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return auditLogApi<{ data: AuditEvent[]; meta: AuditEventsMeta }>(`?${params}`, {
    raw: true,
  }).then((r) => ({ events: r.data, nextCursor: r.meta.nextCursor }));
}
