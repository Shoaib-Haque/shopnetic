'use client';

import type { StaffSessionListResponse } from '@shopnetic/contracts';
import { staffManageApi } from '@/features/admin-api/client';

export interface StaffSessionPage {
  sessions: StaffSessionListResponse['sessions'];
  nextCursor: string | undefined;
}

function toPage(r: StaffSessionListResponse): StaffSessionPage {
  return { sessions: r.sessions, nextCursor: r.nextCursor };
}

function pageParams(cursor?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Self-service — every staff role, not just Super Admin. */
export function listMySessions(cursor?: string, limit?: number): Promise<StaffSessionPage> {
  return staffManageApi<StaffSessionListResponse>(`/me/sessions${pageParams(cursor, limit)}`).then(
    toPage,
  );
}

export function revokeMySession(sessionId: string): Promise<void> {
  return staffManageApi<void>(`/me/sessions/${sessionId}`, { method: 'DELETE' });
}

/** "Log out everywhere else" — every session but the one making this request. */
export function revokeMyOtherSessions(): Promise<void> {
  return staffManageApi<void>('/me/sessions/revoke-others', { method: 'POST' });
}

/** Super Admin only (`staff:manage`) — every staff account's sessions, flattened. */
export function listAllSessions(cursor?: string, limit?: number): Promise<StaffSessionPage> {
  return staffManageApi<StaffSessionListResponse>(`/sessions${pageParams(cursor, limit)}`).then(
    toPage,
  );
}

/** Super Admin only — one other staff member's sessions. */
export function listAccountSessions(
  accountId: string,
  cursor?: string,
  limit?: number,
): Promise<StaffSessionPage> {
  return staffManageApi<StaffSessionListResponse>(
    `/${accountId}/sessions${pageParams(cursor, limit)}`,
  ).then(toPage);
}

export function revokeAccountSession(accountId: string, sessionId: string): Promise<void> {
  return staffManageApi<void>(`/${accountId}/sessions/${sessionId}`, { method: 'DELETE' });
}

export function revokeAllAccountSessions(accountId: string): Promise<void> {
  return staffManageApi<void>(`/${accountId}/sessions/revoke-all`, { method: 'POST' });
}
