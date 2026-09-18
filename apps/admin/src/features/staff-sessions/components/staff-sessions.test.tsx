import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { StaffAccount, StaffSession } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listStaff } from '@/features/staff-manage/api';
import { listAccountSessions, listAllSessions } from '../api';
import { StaffSessions } from './staff-sessions';

vi.mock('@/features/staff-manage/api', () => ({ listStaff: vi.fn() }));
vi.mock('../api', () => ({
  listAllSessions: vi.fn(),
  listAccountSessions: vi.fn(),
  revokeAccountSession: vi.fn(),
  revokeAllAccountSessions: vi.fn(),
}));

const mockedListStaff = vi.mocked(listStaff);
const mockedListAllSessions = vi.mocked(listAllSessions);
const mockedListAccountSessions = vi.mocked(listAccountSessions);

function account(id: string, email: string): StaffAccount {
  return {
    id,
    email,
    status: 'active',
    roles: ['ADMIN'],
    totpEnrolled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function session(id: string, accountId: string, accountEmail: string): StaffSession {
  return {
    id,
    accountId,
    accountEmail,
    ip: '1.1.1.1',
    browser: 'Chrome',
    os: 'macOS',
    deviceLabel: 'Chrome on macOS',
    issuedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-08T00:00:00.000Z',
    isCurrent: false,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StaffSessions', () => {
  it('defaults to the All tab, listing sessions across every staff member', async () => {
    mockedListAllSessions.mockResolvedValueOnce({
      sessions: [session('s1', 'acc-1', 'a@shopnetic.test')],
      nextCursor: undefined,
    });

    renderAdmin(<StaffSessions />);

    expect(await screen.findAllByText('Chrome on macOS')).not.toHaveLength(0);
    expect(await screen.findAllByText('a@shopnetic.test')).not.toHaveLength(0);
  });

  it('switching to "By person" lists staff accounts without fetching any sessions yet, and expanding one loads its sessions', async () => {
    mockedListAllSessions.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });
    mockedListStaff.mockResolvedValueOnce({
      accounts: [account('acc-1', 'a@shopnetic.test')],
      nextCursor: undefined,
    });
    mockedListAccountSessions.mockResolvedValueOnce({
      sessions: [session('s1', 'acc-1', 'a@shopnetic.test')],
      nextCursor: undefined,
    });

    renderAdmin(<StaffSessions />);
    await screen.findByText('No active staff sessions.'); // All tab's empty state — confirms it loaded

    fireEvent.click(screen.getByRole('button', { name: 'By person' }));
    await screen.findByRole('button', { name: 'a@shopnetic.test' });
    expect(mockedListAccountSessions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'a@shopnetic.test' }));
    expect(await screen.findAllByText('Chrome on macOS')).not.toHaveLength(0);
    expect(mockedListAccountSessions).toHaveBeenCalledWith('acc-1', undefined, 20);
  });

  it('collapsing an expanded person hides their session list', async () => {
    mockedListAllSessions.mockResolvedValueOnce({ sessions: [], nextCursor: undefined });
    mockedListStaff.mockResolvedValueOnce({
      accounts: [account('acc-1', 'a@shopnetic.test')],
      nextCursor: undefined,
    });
    mockedListAccountSessions.mockResolvedValueOnce({
      sessions: [session('s1', 'acc-1', 'a@shopnetic.test')],
      nextCursor: undefined,
    });

    renderAdmin(<StaffSessions />);
    await screen.findByText('No active staff sessions.');
    fireEvent.click(screen.getByRole('button', { name: 'By person' }));

    const toggle = await screen.findByRole('button', { name: 'a@shopnetic.test' });
    fireEvent.click(toggle);
    expect(await screen.findAllByText('Chrome on macOS')).not.toHaveLength(0);

    fireEvent.click(toggle);
    expect(screen.queryAllByText('Chrome on macOS')).toHaveLength(0);
  });
});
