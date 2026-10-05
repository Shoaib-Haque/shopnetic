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

export interface ListSessionsOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
}

function parseSessionArgs(
  cursorOrOpts?: string | ListSessionsOptions,
  limit?: number,
): { cursor?: string | undefined; limit?: number | undefined } {
  if (typeof cursorOrOpts === 'object' && cursorOrOpts !== null) {
    return cursorOrOpts;
  }
  return { cursor: cursorOrOpts, limit };
}

function pageParams(cursor?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Self-service — every staff role, not just Super Admin. */
export function listMySessions(opts?: ListSessionsOptions): Promise<StaffSessionPage>;
export function listMySessions(cursor?: string, limit?: number): Promise<StaffSessionPage>;
export function listMySessions(
  cursorOrOpts?: string | ListSessionsOptions,
  limit?: number,
): Promise<StaffSessionPage> {
  const opts = parseSessionArgs(cursorOrOpts, limit);
  return staffManageApi<StaffSessionListResponse>(
    `/me/sessions${pageParams(opts.cursor, opts.limit)}`,
  ).then(toPage);
}

export function revokeMySession(sessionId: string): Promise<void> {
  return staffManageApi<void>(`/me/sessions/${sessionId}`, { method: 'DELETE' });
}

/** "Log out everywhere else" — every session but the one making this request. */
export function revokeMyOtherSessions(): Promise<void> {
  return staffManageApi<void>('/me/sessions/revoke-others', { method: 'POST' });
}

/** Super Admin only (`staff:manage`) — every staff account's sessions, flattened. */
export function listAllSessions(opts?: ListSessionsOptions): Promise<StaffSessionPage>;
export function listAllSessions(cursor?: string, limit?: number): Promise<StaffSessionPage>;
export function listAllSessions(
  cursorOrOpts?: string | ListSessionsOptions,
  limit?: number,
): Promise<StaffSessionPage> {
  const opts = parseSessionArgs(cursorOrOpts, limit);
  return staffManageApi<StaffSessionListResponse>(
    `/sessions${pageParams(opts.cursor, opts.limit)}`,
  ).then(toPage);
}

/** Super Admin only — one other staff member's sessions. */
export function listAccountSessions(
  accountId: string,
  opts?: ListSessionsOptions,
): Promise<StaffSessionPage>;
export function listAccountSessions(
  accountId: string,
  cursor?: string,
  limit?: number,
): Promise<StaffSessionPage>;
export function listAccountSessions(
  accountId: string,
  cursorOrOpts?: string | ListSessionsOptions,
  limit?: number,
): Promise<StaffSessionPage> {
  const opts = parseSessionArgs(cursorOrOpts, limit);
  return staffManageApi<StaffSessionListResponse>(
    `/${accountId}/sessions${pageParams(opts.cursor, opts.limit)}`,
  ).then(toPage);
}

export function revokeAccountSession(accountId: string, sessionId: string): Promise<void> {
  return staffManageApi<void>(`/${accountId}/sessions/${sessionId}`, { method: 'DELETE' });
}

export function revokeAllAccountSessions(accountId: string): Promise<void> {
  return staffManageApi<void>(`/${accountId}/sessions/revoke-all`, { method: 'POST' });
}
