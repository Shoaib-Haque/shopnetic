'use client';

import type { StaffAccount, StaffListResponse, StaffRole } from '@shopnetic/contracts';
import { staffManageApi } from '@/features/admin-api/client';

export interface StaffListPage {
  accounts: StaffAccount[];
  nextCursor: string | undefined;
}

export interface ListStaffOptions {
  cursor?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

export function listStaff(opts?: ListStaffOptions): Promise<StaffListPage>;
export function listStaff(cursor?: string, q?: string, limit?: number): Promise<StaffListPage>;
export function listStaff(
  cursorOrOpts?: string | ListStaffOptions,
  q?: string,
  limit?: number,
): Promise<StaffListPage> {
  const opts: ListStaffOptions =
    typeof cursorOrOpts === 'object' && cursorOrOpts !== null
      ? cursorOrOpts
      : { cursor: cursorOrOpts, q, limit };

  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return staffManageApi<StaffListResponse>(qs ? `?${qs}` : '').then((r) => ({
    accounts: r.accounts,
    nextCursor: r.nextCursor,
  }));
}

/** One account by id — for a deep link's direct-by-id lookup
 * (`useHighlightTarget`), not the paginated list. */
export function getStaffAccount(accountId: string): Promise<StaffAccount> {
  return staffManageApi<StaffAccount>(`/${accountId}`, { priority: 'high' });
}

export function changeStaffRole(accountId: string, role: StaffRole): Promise<StaffAccount> {
  return staffManageApi<StaffAccount>(`/${accountId}/role`, { method: 'PATCH', body: { role } });
}

/** Covers both `locked` → `active` (unlock) and `disabled` → `active`
 * (reactivate after a deprovision) — same status flip either way. */
export function activateStaff(accountId: string): Promise<StaffAccount> {
  return staffManageApi<StaffAccount>(`/${accountId}/activate`, { method: 'POST' });
}

export function resetStaffTotp(accountId: string): Promise<StaffAccount> {
  return staffManageApi<StaffAccount>(`/${accountId}/reset-totp`, { method: 'POST' });
}

export function deprovisionStaff(accountId: string): Promise<StaffAccount> {
  return staffManageApi<StaffAccount>(`/${accountId}/deprovision`, { method: 'POST' });
}
