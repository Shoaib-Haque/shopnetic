import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { StaffAccount } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { AdminApiError } from '@/features/admin-api/client';
import {
  activateStaff,
  changeStaffRole,
  deprovisionStaff,
  listStaff,
  resetStaffTotp,
  type StaffListPage,
} from '../api';
import { StaffList } from './staff-list';

vi.mock('../api', () => ({
  listStaff: vi.fn(),
  changeStaffRole: vi.fn(),
  activateStaff: vi.fn(),
  resetStaffTotp: vi.fn(),
  deprovisionStaff: vi.fn(),
}));

const PATHNAME = '/en/x7f2k9t3m1qp/staff';
const routerReplace = vi.fn();
// per-test control over what `useSearchParams()` returns on mount —
// reassigned (not mutated) in `beforeEach`, and the mock factory re-reads
// this binding on every call rather than capturing one instance.
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => PATHNAME,
  useSearchParams: () => mockSearchParams,
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

function page(accounts: StaffAccount[], nextCursor?: string): StaffListPage {
  return { accounts, nextCursor };
}

function render(currentEmail = ME.email) {
  return renderAdmin(<StaffList currentEmail={currentEmail} />);
}

// jsdom doesn't apply the responsive `hidden md:block` / `md:hidden` classes,
// so the desktop table and the mobile card list both render at once — every
// account's email (and the `title=` span carrying it) appears twice. Real
// browsers show exactly one; `findAllByText`/`getAllByText` is the honest
// query here, not a workaround for a product bug. `tableRowFor` picks out
// the desktop `<tr>` specifically, for tests that need to scope into one
// row's own cells or open its action menu.
function tableRowFor(email: string): HTMLElement {
  const row = screen
    .getAllByText(email)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null);
  if (!row) throw new Error(`no table row found for ${email}`);
  return row;
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

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  routerReplace.mockReset();
});

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
    mockedListStaff.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([ME]));

    render();
    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findAllByText(ME.email)).length).toBeGreaterThan(0);
    expect(mockedListStaff).toHaveBeenCalledTimes(2);
  });

  it('scrolling the sentinel into view appends the next page; the sentinel disappears once there is no next cursor', async () => {
    const other = account({ id: 'acc-2', email: 'other@example.com' });
    mockedListStaff
      .mockResolvedValueOnce(page([ME], 'cursor-1'))
      .mockResolvedValueOnce(page([other], undefined));

    render();
    await screen.findAllByText(ME.email);
    expect(screen.queryByText(other.email)).not.toBeInTheDocument();

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    await screen.findAllByText(other.email);
    expect(mockedListStaff).toHaveBeenCalledWith('cursor-1');
    expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
  });

  it('a failed later page keeps the already-loaded row and offers a retry, without wiping the list', async () => {
    const other = account({ id: 'acc-2', email: 'other@example.com' });
    mockedListStaff
      .mockResolvedValueOnce(page([ME], 'cursor-1'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([other], undefined));

    render();
    const sentinel = await screen.findByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.getAllByText(ME.email).length).toBeGreaterThan(0); // still there

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findAllByText(other.email);
  });

  it('renders each account’s role, status, TOTP state, and marks the signed-in row "You"', async () => {
    const other = account({ id: 'acc-2', email: 'locked@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce(page([ME, other]));

    render();
    await screen.findAllByText(ME.email);
    const meRow = tableRowFor(ME.email);
    expect(within(meRow).getByText('You')).toBeInTheDocument();
    expect(within(meRow).getByText('Super Admin')).toBeInTheDocument();
    expect(within(meRow).getByText('Active')).toBeInTheDocument();

    const otherRow = tableRowFor('locked@example.com');
    expect(within(otherRow).getByText('Locked')).toBeInTheDocument();
    expect(within(otherRow).queryByText('You')).not.toBeInTheDocument();
  });

  it('a long email is truncated in the row (with a title= fallback) and capped when it flows into a dialog/toast', async () => {
    const longEmail =
      'a.very.long.address.that.goes.on.and.on.for.a.while@some-verbose-company-name.example.com';
    const target = account({ id: 'acc-long', email: longEmail, status: 'locked' });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));
    mockedActivateStaff.mockResolvedValueOnce({ ...target, status: 'active' });

    render();
    await screen.findAllByTitle(longEmail);
    const cell = tableRowFor(longEmail).querySelector(`[title="${longEmail}"]`) as HTMLElement;
    expect(cell).toHaveClass('truncate');
    // the table row and the mobile card each show the full address once —
    // the confirm dialog that's about to open must not add a third copy
    expect(screen.getAllByText(longEmail)).toHaveLength(2);

    openRowMenu(tableRowFor(longEmail));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));
    await screen.findByRole('button', { name: 'Unlock' });
    expect(screen.getAllByText(longEmail)).toHaveLength(2);
    expect(screen.getByText(/…/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByText(/…/); // the toast, once the dialog itself is gone
    expect(screen.getAllByText(longEmail)).toHaveLength(2);
  });

  it('the signed-in user’s own row cannot change its role or deprovision itself', async () => {
    mockedListStaff.mockResolvedValueOnce(page([ME]));
    render();
    await screen.findAllByText(ME.email);

    openRowMenu(tableRowFor(ME.email));

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
    mockedListStaff.mockResolvedValueOnce(page([locked, disabled]));
    render();
    await screen.findAllByText(locked.email);

    openRowMenu(tableRowFor(locked.email));
    expect(await screen.findByRole('menuitem', { name: 'Unlock' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).not.toBeInTheDocument();
    // still offered — deprovision doesn't require unlocking first
    expect(screen.getByRole('menuitem', { name: 'Deprovision' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    openRowMenu(tableRowFor(disabled.email));
    expect(await screen.findByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Unlock' })).not.toBeInTheDocument();
    // hidden once already disabled — nothing to deprovision further
    expect(screen.queryByRole('menuitem', { name: 'Deprovision' })).not.toBeInTheDocument();
  });

  it('changes a role: opens the modal, submits the choice, updates the row, toasts', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', roles: ['ADMIN'] });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));
    mockedChangeStaffRole.mockResolvedValueOnce({ ...target, roles: ['SUPER_ADMIN'] });

    render();
    await screen.findAllByText(target.email);
    openRowMenu(tableRowFor(target.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change role' }));

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'SUPER_ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Role updated for target@example.com.')).toBeInTheDocument();
    expect(mockedChangeStaffRole).toHaveBeenCalledWith('acc-2', 'SUPER_ADMIN');
    const row = tableRowFor(target.email);
    expect(within(row).getByText('Super Admin')).toBeInTheDocument();
  });

  it('unlocks a locked account through the confirm dialog', async () => {
    const locked = account({ id: 'acc-2', email: 'locked@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce(page([ME, locked]));
    mockedActivateStaff.mockResolvedValueOnce({ ...locked, status: 'active' });

    render();
    await screen.findAllByText(locked.email);
    openRowMenu(tableRowFor(locked.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('locked@example.com unlocked.')).toBeInTheDocument();
    expect(mockedActivateStaff).toHaveBeenCalledWith('acc-2');
  });

  it('reactivates a deprovisioned (disabled) account through the confirm dialog', async () => {
    const disabled = account({ id: 'acc-2', email: 'disabled@example.com', status: 'disabled' });
    mockedListStaff.mockResolvedValueOnce(page([ME, disabled]));
    mockedActivateStaff.mockResolvedValueOnce({ ...disabled, status: 'active' });

    render();
    await screen.findAllByText(disabled.email);
    openRowMenu(tableRowFor(disabled.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reactivate' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText('disabled@example.com reactivated.')).toBeInTheDocument();
    expect(mockedActivateStaff).toHaveBeenCalledWith('acc-2');
    // the row's status badge itself updates, not just the toast
    const row = tableRowFor(disabled.email);
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('resets TOTP through the confirm dialog', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', totpEnrolled: true });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));
    mockedResetStaffTotp.mockResolvedValueOnce({ ...target, totpEnrolled: false });

    render();
    await screen.findAllByText(target.email);
    openRowMenu(tableRowFor(target.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset authenticator' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

    expect(
      await screen.findByText('Authenticator reset for target@example.com.'),
    ).toBeInTheDocument();
    expect(mockedResetStaffTotp).toHaveBeenCalledWith('acc-2');
  });

  it('deprovisions an account through the confirm dialog', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com' });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));
    mockedDeprovisionStaff.mockResolvedValueOnce({ ...target, status: 'disabled' });

    render();
    await screen.findAllByText(target.email);
    openRowMenu(tableRowFor(target.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Deprovision' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deprovision' }));

    expect(await screen.findByText('target@example.com deprovisioned.')).toBeInTheDocument();
    expect(mockedDeprovisionStaff).toHaveBeenCalledWith('acc-2');
  });

  it('a failed action shows the mapped error copy, not a generic one', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com', status: 'locked' });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));
    mockedActivateStaff.mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR', 422));

    render();
    await screen.findAllByText(target.email);
    openRowMenu(tableRowFor(target.email));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unlock' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    expect(
      await screen.findByText('Please check the highlighted fields and try again.'),
    ).toBeInTheDocument();
  });

  it("the Role column is hidden between md and lg — Email doesn't have room to share the row with it in that band", async () => {
    // jsdom doesn't apply real responsive breakpoints, so this only proves
    // the structural mechanism (`hidden lg:table-cell`, the same technique
    // `category-tree.tsx`'s own Brand column uses for the identical reason)
    // is actually in place — not that it visually collapses at a given width.
    mockedListStaff.mockResolvedValueOnce(page([ME]));
    render();
    await screen.findAllByText(ME.email);

    const roleHeader = screen.getByRole('columnheader', { name: 'Role' });
    expect(roleHeader).toHaveClass('hidden', 'lg:table-cell');
    const roleCell = tableRowFor(ME.email).querySelector('td:nth-child(2)');
    expect(roleCell).toHaveClass('hidden', 'lg:table-cell');
  });

  it('the row menu trigger shows a "More actions" tooltip on focus — PC users get a visible hint, not just an aria-label', async () => {
    mockedListStaff.mockResolvedValueOnce(page([ME]));
    render();
    await screen.findAllByText(ME.email);
    const trigger = tableRowFor(ME.email).querySelector('button[aria-label="More actions"]')!;

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('More actions');
  });
});

describe('StaffList — deep link from Audit Log (?highlight=accountId)', () => {
  it('flashes the target row when it is already on the first page, and strips the param from the URL', async () => {
    const target = account({ id: 'acc-2', email: 'target@example.com' });
    mockSearchParams = new URLSearchParams({ highlight: target.id });
    mockedListStaff.mockResolvedValueOnce(page([ME, target]));

    render();
    await screen.findAllByText(target.email);

    expect(document.querySelector(`[data-staff-row="${target.id}"]`)).toHaveClass('sn-row-flash');
    expect(routerReplace).toHaveBeenCalledWith(PATHNAME, { scroll: false });
  });

  it('keeps loading pages until the target turns up, then flashes it', async () => {
    const target = account({ id: 'acc-9', email: 'later-page@example.com' });
    mockSearchParams = new URLSearchParams({ highlight: target.id });
    mockedListStaff
      .mockResolvedValueOnce(page([ME], 'cursor-1'))
      .mockResolvedValueOnce(page([target], undefined));

    render();
    await screen.findAllByText(target.email);

    expect(document.querySelector(`[data-staff-row="${target.id}"]`)).toHaveClass('sn-row-flash');
    expect(mockedListStaff).toHaveBeenCalledWith('cursor-1');
  });

  it('without a highlight param, nothing flashes and the URL never gets a highlight param added', async () => {
    mockedListStaff.mockResolvedValueOnce(page([ME]));
    render();
    await screen.findAllByText(ME.email);

    expect(document.querySelector(`[data-staff-row="${ME.id}"]`)).not.toHaveClass('sn-row-flash');
    // the q-sync effect below still fires a mount-time no-op replace (same
    // as Category List / Audit Log's own filter sync) — what matters here
    // is that `highlight` never appears in any of those calls
    for (const [url] of routerReplace.mock.calls) {
      expect(url).not.toContain('highlight');
    }
  });
});

describe('StaffList — search', () => {
  it('typing a query re-fetches (debounced) with q, and the URL syncs to it', async () => {
    const target = account({ id: 'acc-2', email: 'search-target@example.com' });
    mockedListStaff.mockResolvedValueOnce(page([ME])).mockResolvedValueOnce(page([target]));

    render();
    await screen.findAllByText(ME.email);

    fireEvent.change(screen.getByPlaceholderText('Search staff by email…'), {
      target: { value: 'search-target' },
    });

    await screen.findAllByText(target.email);
    expect(mockedListStaff).toHaveBeenLastCalledWith(undefined, 'search-target');
    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(`${PATHNAME}?q=search-target`, {
        scroll: false,
      }),
    );
  });

  it('a link with ?q= already in it pre-fills the search box and fetches that filtered view on mount', async () => {
    mockSearchParams = new URLSearchParams({ q: 'sukanto' });
    mockedListStaff.mockResolvedValueOnce(page([ME]));

    render();
    await screen.findAllByText(ME.email);

    expect(screen.getByPlaceholderText('Search staff by email…')).toHaveValue('sukanto');
    expect(mockedListStaff).toHaveBeenCalledWith(undefined, 'sukanto');
  });

  it('no matches shows "no staff match your search", not the generic empty state', async () => {
    mockedListStaff.mockResolvedValueOnce(page([ME])).mockResolvedValueOnce(page([]));

    render();
    await screen.findAllByText(ME.email);

    fireEvent.change(screen.getByPlaceholderText('Search staff by email…'), {
      target: { value: 'nobody-matches-this' },
    });

    expect(await screen.findByText('No staff match your search.')).toBeInTheDocument();
    expect(screen.queryByText('No staff accounts yet.')).not.toBeInTheDocument();
  });

  it('clearing the search box goes back to the unfiltered list and the bare URL', async () => {
    mockSearchParams = new URLSearchParams({ q: 'sukanto' });
    mockedListStaff.mockResolvedValueOnce(page([ME])).mockResolvedValueOnce(page([ME]));

    render();
    await screen.findAllByText(ME.email);
    routerReplace.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    await waitFor(() => expect(mockedListStaff).toHaveBeenLastCalledWith(undefined));
    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(PATHNAME, { scroll: false }),
    );
  });
});
