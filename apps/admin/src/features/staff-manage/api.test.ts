import { describe, expect, it, vi } from 'vitest';
import { staffManageApi } from '@/features/admin-api/client';
import { listStaff } from './api';

vi.mock('@/features/admin-api/client', () => ({
  staffManageApi: vi.fn(),
}));

const mockedStaffManageApi = vi.mocked(staffManageApi);

describe('staffManage api — listStaff', () => {
  it('calls staffManageApi with no query params when called with no arguments', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ accounts: [], nextCursor: undefined });

    const result = await listStaff();
    expect(mockedStaffManageApi).toHaveBeenCalledWith('');
    expect(result).toEqual({ accounts: [], nextCursor: undefined });
  });

  it('supports options object syntax with limit, cursor, and q', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({
      accounts: [{ id: '1', email: 'test@example.com' }],
      nextCursor: 'next-1',
    });

    const result = await listStaff({ cursor: 'c1', q: 'search', limit: 30 });
    expect(mockedStaffManageApi).toHaveBeenCalledWith('?cursor=c1&q=search&limit=30');
    expect(result.nextCursor).toBe('next-1');
  });

  it('supports legacy positional arguments syntax', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ accounts: [], nextCursor: undefined });

    await listStaff('c2', 'admin', 15);
    expect(mockedStaffManageApi).toHaveBeenCalledWith('?cursor=c2&q=admin&limit=15');
  });
});
