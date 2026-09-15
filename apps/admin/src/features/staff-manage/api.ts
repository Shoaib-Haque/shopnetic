'use client';

import type { StaffAccount, StaffListResponse, StaffRole } from '@shopnetic/contracts';
import { staffManageApi } from '@/features/admin-api/client';

export function listStaff(): Promise<StaffAccount[]> {
  return staffManageApi<StaffListResponse>('').then((r) => r.accounts);
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
