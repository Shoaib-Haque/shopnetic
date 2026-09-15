import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { StaffAccount } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import {
  activateStaff,
  changeStaffRole,
  deprovisionStaff,
  listStaff,
  resetStaffTotp,
} from '../api';
import { StaffList } from './staff-list';

vi.mock('../api', () => ({
  listStaff: vi.fn(),
  changeStaffRole: vi.fn(),
  activateStaff: vi.fn(),
  resetStaffTotp: vi.fn(),
  deprovisionStaff: vi.fn(),
}));

const mockedListStaff = vi.mocked(listStaff);
const mockedChangeStaffRole = vi.mocked(changeStaffRole);
const mockedActivateStaff = vi.mocked(activateStaff);
const mockedResetStaffTotp = vi.mocked(resetStaffTotp);
const mockedDeprovisionStaff = vi.mocked(deprovisionStaff);

function account(overrides: Partial<StaffAccount> = {}): StaffAccount {
  return {
    id: 'acc-1',
    email: 'admin@example.com',
    status: 'active',
    roles: ['ADMIN'],
    totpEnrolled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ME = account({ id: 'me', email: 'me@example.com', roles: ['SUPER_ADMIN'] });

function render(currentEmail = ME.email) {
  return renderAdmin(<StaffList currentEmail={currentEmail} />);
}

/** Open the row's "more actions" menu. Radix's trigger opens on `pointerdown`
 * (or Enter/Space/ArrowDown) — jsdom's `fireEvent.click` never fires a
 * `pointerdown` first the way a real browser interaction would, so a plain
 * click silently does nothing; the keyboard path avoids that entirely. */
function openRowMenu(row: HTMLElement) {
  const trigger = within(row).getByRole('button', { name: 'More actions' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

afterEach(() => {
  cleanup();
  mockedListStaff.mockReset();
  mockedChangeStaffRole.mockReset();
  mockedActivateStaff.mockReset();
  mockedResetStaffTotp.mockReset();
  mockedDeprovisionStaff.mockReset();
});

describe('StaffList', () => {
  it('load error → shows the error state, retry re-fetches', async () => {
    mockedListStaff.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([ME]);

    render();
    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(ME.email)).toBeInTheDocument();
    expect(mockedListStaff).toHaveBeenCalledTimes(2);
  });

  it('renders each account’s role, status, TOTP state, and marks the signed-in row "You"', async () => {
    const other = account({ id: 'acc-2', email: 'locked@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce([ME, other]);

    render();
    expect(await screen.findByText(ME.email)).toBeInTheDocument();
    const meRow = screen.getByText(ME.email).closest('tr')!;
    expect(within(meRow).getByText('You')).toBeInTheDocument();
    expect(within(meRow).getByText('Super Admin')).toBeInTheDocument();
    expect(within(meRow).getByText('Active')).toBeInTheDocument();

    const otherRow = screen.getByText('locked@example.com').closest('tr')!;
    expect(within(otherRow).getByText('Locked')).toBeInTheDocument();
    expect(within(otherRow).queryByText('You')).not.toBeInTheDocument();
  });

  it('a long email is truncated in the row (with a title= fallback) and capped when it flows into a dialog/toast', async () => {
    const longEmail =
      'a.very.long.address.that.goes.on.and.on.for.a.while@some-verbose-company-name.example.com';
    const target = account({ id: 'acc-long', email: longEmail, status: 'locked' });
    mockedListStaff.mockResolvedValueOnce([ME, target]);
    mockedActivateStaff.mockResolvedValueOnce({ ...target, status: 'active' });

    render();
    const cell = await screen.findByTitle(longEmail);
    expect(cell).toHaveClass('truncate');
    // only the row itself has the full address — the confirm dialog that's
    // about to open must not repeat it verbatim
    expect(screen.getAllByText(longEmail)).toHaveLength(1);

    openRowMenu(cell.closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));
    await screen.findByRole('button', { name: 'Unlock' });
    expect(screen.getAllByText(longEmail)).toHaveLength(1);
    expect(screen.getByText(/…/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByText(/…/); // the toast, once the dialog itself is gone
    expect(screen.getAllByText(longEmail)).toHaveLength(1);
  });

  it('the signed-in user’s own row cannot change its role or deprovision itself', async () => {
    mockedListStaff.mockResolvedValueOnce([ME]);
    render();
    await screen.findByText(ME.email);

    const row = screen.getByText(ME.email).closest('tr')!;
    openRowMenu(row);

    expect(await screen.findByRole('menuitem', { name: 'Change role' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Deprovision' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('a locked row offers "Unlock", a disabled row offers "Reactivate" (not both, not neither)', async () => {
    const locked = account({ id: 'acc-locked', email: 'locked@example.com', status: 'locked' });
    const disabled = account({
      id: 'acc-disabled',
      email: 'disabled@example.com',
      status: 'disabled',
    });
    mockedListStaff.mockResolvedValueOnce([locked, disabled]);
    render();
    await screen.findByText(locked.email);

    openRowMenu(screen.getByText(locked.email).closest('tr')!);
    expect(await screen.findByRole('menuitem', { name: 'Unlock' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).not.toBeInTheDocument();
    // still offered — deprovision doesn't require unlocking first
    expect(screen.getByRole('menuitem', { name: 'Deprovision' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    openRowMenu(screen.getByText(disabled.email).closest('tr')!);
    expect(await screen.findByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Unlock' })).not.toBeInTheDocument();
    // hidden once already disabled — nothing to deprovision further
    expect(screen.queryByRole('menuitem', { name: 'Deprovision' })).not.toBeInTheDocument();
  });

  it('changes a role: opens the modal, submits the choice, updates the row, toasts', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', roles: ['ADMIN'] });
    mockedListStaff.mockResolvedValueOnce([ME, target]);
    mockedChangeStaffRole.mockResolvedValueOnce({ ...target, roles: ['SUPER_ADMIN'] });

    render();
    await screen.findByText(target.email);
    openRowMenu(screen.getByText(target.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change role' }));

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'SUPER_ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Role updated for target@example.com.')).toBeInTheDocument();
    expect(mockedChangeStaffRole).toHaveBeenCalledWith('acc-2', 'SUPER_ADMIN');
    const row = screen.getByText(target.email).closest('tr')!;
    expect(within(row).getByText('Super Admin')).toBeInTheDocument();
  });

  it('unlocks a locked account through the confirm dialog', async () => {
    const locked = account({ id: 'acc-2', email: 'locked@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce([ME, locked]);
    mockedActivateStaff.mockResolvedValueOnce({ ...locked, status: 'active' });

    render();
    await screen.findByText(locked.email);
    openRowMenu(screen.getByText(locked.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('locked@example.com unlocked.')).toBeInTheDocument();
    expect(mockedActivateStaff).toHaveBeenCalledWith('acc-2');
  });

  it('reactivates a deprovisioned (disabled) account through the confirm dialog', async () => {
    const disabled = account({ id: 'acc-2', email: 'disabled@example.com', status: 'disabled' });
    mockedListStaff.mockResolvedValueOnce([ME, disabled]);
    mockedActivateStaff.mockResolvedValueOnce({ ...disabled, status: 'active' });

    render();
    await screen.findByText(disabled.email);
    openRowMenu(screen.getByText(disabled.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reactivate' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText('disabled@example.com reactivated.')).toBeInTheDocument();
    expect(mockedActivateStaff).toHaveBeenCalledWith('acc-2');
    // the row's status badge itself updates, not just the toast
    const row = screen.getByText(disabled.email).closest('tr')!;
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('resets TOTP through the confirm dialog', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', totpEnrolled: true });
    mockedListStaff.mockResolvedValueOnce([ME, target]);
    mockedResetStaffTotp.mockResolvedValueOnce({ ...target, totpEnrolled: false });

    render();
    await screen.findByText(target.email);
    openRowMenu(screen.getByText(target.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset authenticator' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

    expect(
      await screen.findByText('Authenticator reset for target@example.com.'),
    ).toBeInTheDocument();
    expect(mockedResetStaffTotp).toHaveBeenCalledWith('acc-2');
  });

  it('deprovisions an account through the confirm dialog', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com' });
    mockedListStaff.mockResolvedValueOnce([ME, target]);
    mockedDeprovisionStaff.mockResolvedValueOnce({ ...target, status: 'disabled' });

    render();
    await screen.findByText(target.email);
    openRowMenu(screen.getByText(target.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Deprovision' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deprovision' }));

    expect(await screen.findByText('target@example.com deprovisioned.')).toBeInTheDocument();
    expect(mockedDeprovisionStaff).toHaveBeenCalledWith('acc-2');
  });

  it('a failed action shows the mapped error copy, not a generic one', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce([ME, target]);
    mockedActivateStaff.mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR', 422));

    render();
    await screen.findByText(target.email);
    openRowMenu(screen.getByText(target.email).closest('tr')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    expect(
      await screen.findByText('Please check the highlighted fields and try again.'),
    ).toBeInTheDocument();
  });
});
