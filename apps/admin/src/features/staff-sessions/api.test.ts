import { describe, expect, it, vi } from 'vitest';
import { staffManageApi } from '@/features/admin-api/client';
import {
  listAllSessions,
  listMySessions,
  listAccountSessions,
  revokeMySession,
  revokeMyOtherSessions,
  revokeAccountSession,
  revokeAllAccountSessions,
} from './api';

vi.mock('@/features/admin-api/client', () => ({
  staffManageApi: vi.fn(),
}));

const mockedStaffManageApi = vi.mocked(staffManageApi);

describe('staffSessions api', () => {
  it('listAllSessions supports options object with cursor and limit', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });

    await listAllSessions({ cursor: 'cur-1', limit: 30 });
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/sessions?cursor=cur-1&limit=30');
  });

  it('listAllSessions supports legacy positional arguments', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });

    await listAllSessions('cur-2', 15);
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/sessions?cursor=cur-2&limit=15');
  });

  it('listMySessions supports options object with limit', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });

    await listMySessions({ limit: 30 });
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/me/sessions?limit=30');
  });

  it('listAccountSessions supports accountId and options object with limit', async () => {
    mockedStaffManageApi.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });

    await listAccountSessions('acc-1', { cursor: 'cur-3', limit: 20 });
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/acc-1/sessions?cursor=cur-3&limit=20');
  });

  it('revoke functions issue DELETE/POST to expected endpoints', async () => {
    mockedStaffManageApi.mockResolvedValue(undefined);

    await revokeMySession('s-1');
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/me/sessions/s-1', { method: 'DELETE' });

    await revokeMyOtherSessions();
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/me/sessions/revoke-others', {
      method: 'POST',
    });

    await revokeAccountSession('acc-1', 's-2');
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/acc-1/sessions/s-2', { method: 'DELETE' });

    await revokeAllAccountSessions('acc-1');
    expect(mockedStaffManageApi).toHaveBeenCalledWith('/acc-1/sessions/revoke-all', {
      method: 'POST',
    });
  });
});
