import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { StaffSession } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { SessionList } from './session-list';

function session(id: string, overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    id,
    accountId: 'acc-1',
    accountEmail: 'staff@shopnetic.test',
    ip: '203.0.113.5',
    browser: 'Chrome',
    os: 'macOS',
    deviceLabel: 'Chrome on macOS',
    issuedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    expiresAt: '2026-01-09T00:00:00.000Z',
    isCurrent: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe('SessionList', () => {
  it('renders sessions from fetchPage, marking the current one and disabling its revoke button', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [session('a', { isCurrent: true }), session('b')],
      nextCursor: undefined,
    });
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions" />,
    );

    await screen.findAllByText('Chrome on macOS');
    // jsdom renders both the desktop table and the mobile card list at once
    // (no real CSS media queries) — scope to the table to count rows once,
    // not twice.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('This device')).toBeInTheDocument();

    const revokeButtons = table.getAllByRole('button', { name: 'Log out' });
    expect(revokeButtons).toHaveLength(2);
    expect(revokeButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(revokeButtons.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('shows the empty message when there are no sessions', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], nextCursor: undefined });
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions here" />,
    );
    expect(await screen.findByText('No sessions here')).toBeInTheDocument();
  });

  it('shows the account email per row only when showAccountEmail is set', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [session('a')], nextCursor: undefined });
    const { unmount } = renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions" />,
    );
    await screen.findAllByText('Chrome on macOS');
    expect(screen.queryByText('staff@shopnetic.test')).not.toBeInTheDocument();
    unmount();

    const fetchPage2 = vi.fn().mockResolvedValue({ items: [session('a')], nextCursor: undefined });
    renderAdmin(
      <SessionList
        fetchPage={fetchPage2}
        onRevokeOne={vi.fn()}
        showAccountEmail
        emptyMessage="No sessions"
      />,
    );
    expect(await screen.findAllByText('staff@shopnetic.test')).not.toHaveLength(0);
  });

  it('revoking a session calls onRevokeOne and removes the row on success', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue({ items: [session('a'), session('b')], nextCursor: undefined });
    const onRevokeOne = vi.fn().mockResolvedValue(undefined);
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={onRevokeOne} emptyMessage="No sessions" />,
    );

    await screen.findAllByText('Chrome on macOS');
    fireEvent.click(
      within(screen.getByRole('table')).getAllByRole('button', { name: 'Log out' })[0]!,
    );

    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Log out' }));

    await waitFor(() =>
      expect(onRevokeOne).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' })),
    );
    // one row left in the table, not two
    await waitFor(
      () => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2), // header + 1 body row
    );
  });

  it('a bulk action shows a confirm dialog, calls run(), and toasts on success', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [session('a')], nextCursor: undefined });
    const run = vi.fn().mockResolvedValue(undefined);
    renderAdmin(
      <SessionList
        fetchPage={fetchPage}
        onRevokeOne={vi.fn()}
        emptyMessage="No sessions"
        bulkAction={{
          label: 'Log out others',
          confirmTitle: 'Log out other devices?',
          confirmMessage: 'Every other session will be signed out.',
          confirmLabel: 'Log out others',
          run,
          successMessage: 'Other devices signed out.',
        }}
      />,
    );

    await screen.findAllByText('Chrome on macOS');
    fireEvent.click(screen.getByRole('button', { name: 'Log out others' }));

    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Log out others' }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Other devices signed out.')).toBeInTheDocument();
  });

  it('strips the IPv4-mapped-IPv6 "::ffff:" prefix so the IP column reads as plain IPv4 — found live', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue({
        items: [session('a', { ip: '::ffff:203.0.113.5' })],
        nextCursor: undefined,
      });
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions" />,
    );

    expect(await screen.findAllByText('203.0.113.5')).not.toHaveLength(0);
    expect(screen.queryByText('::ffff:203.0.113.5')).not.toBeInTheDocument();
  });

  it('a real (non-mapped) IP passes through unchanged', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue({ items: [session('a', { ip: '2001:db8::1' })], nextCursor: undefined });
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions" />,
    );

    expect(await screen.findAllByText('2001:db8::1')).not.toHaveLength(0);
  });

  it('the mobile card puts the IP and last-active time on separate lines, not joined into one — found live', async () => {
    const s = session('a');
    const fetchPage = vi.fn().mockResolvedValue({ items: [s], nextCursor: undefined });
    renderAdmin(
      <SessionList fetchPage={fetchPage} onRevokeOne={vi.fn()} emptyMessage="No sessions" />,
    );

    // the mobile card list is the only <ul> SessionList renders
    const card = within(await screen.findByRole('list'));
    const ipEl = card.getByText('203.0.113.5');
    const timeEl = card.getByText(new Date(s.lastUsedAt!).toLocaleString());
    expect(ipEl).not.toBe(timeEl);
    // each its own element's full text, not "203.0.113.5 · <time>" joined
    expect(ipEl.textContent).toBe('203.0.113.5');
  });

  it('the bulk action button is disabled when there is nothing to revoke — found live', async () => {
    const bulkAction = {
      label: 'Log out everywhere',
      confirmTitle: 'x',
      confirmMessage: 'x',
      confirmLabel: 'x',
      run: vi.fn(),
      successMessage: 'x',
    };

    // case 1: the list is genuinely empty
    const fetchPageEmpty = vi.fn().mockResolvedValue({ items: [], nextCursor: undefined });
    const { unmount } = renderAdmin(
      <SessionList
        fetchPage={fetchPageEmpty}
        onRevokeOne={vi.fn()}
        emptyMessage="No sessions"
        bulkAction={bulkAction}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Log out everywhere' })).toBeDisabled();
    unmount();

    // case 2: self-service — the only row left is the current session itself
    const fetchPageOnlyCurrent = vi
      .fn()
      .mockResolvedValue({ items: [session('a', { isCurrent: true })], nextCursor: undefined });
    renderAdmin(
      <SessionList
        fetchPage={fetchPageOnlyCurrent}
        onRevokeOne={vi.fn()}
        emptyMessage="No sessions"
        bulkAction={bulkAction}
      />,
    );
    await screen.findAllByText('Chrome on macOS');
    expect(screen.getByRole('button', { name: 'Log out everywhere' })).toBeDisabled();
  });

  it('the bulk action button is enabled once there is at least one non-current session', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [session('a', { isCurrent: true }), session('b')],
      nextCursor: undefined,
    });
    renderAdmin(
      <SessionList
        fetchPage={fetchPage}
        onRevokeOne={vi.fn()}
        emptyMessage="No sessions"
        bulkAction={{
          label: 'Log out everywhere',
          confirmTitle: 'x',
          confirmMessage: 'x',
          confirmLabel: 'x',
          run: vi.fn(),
          successMessage: 'x',
        }}
      />,
    );
    await screen.findAllByText('Chrome on macOS');
    expect(screen.getByRole('button', { name: 'Log out everywhere' })).toBeEnabled();
  });
});
