import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { AdminTestProviders, renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { AdminShell } from './admin-shell';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();
let mockPathname = '/en/x7f2k9t3m1qp';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: routerRefresh,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  // forwards aria-current/onClick/etc, not just href — the auto-expand test
  // asserts aria-current on the rendered anchor, which a href-only mock drops
  default: ({
    children,
    href,
    ...rest
  }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';

function render(roles: string[] = ['SUPER_ADMIN']) {
  return renderAdmin(
    <AdminShell
      email="staff@example.com"
      roles={roles}
      root="/en/x7f2k9t3m1qp"
      loginHref={LOGIN_HREF}
    >
      <p>page content</p>
    </AdminShell>,
  );
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
  mockPathname = '/en/x7f2k9t3m1qp';
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('AdminShell sign-out', () => {
  it('succeeds: navigates to login and refreshes', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 200, body: { data: { ok: true } } });

    render();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF));
    expect(routerRefresh).toHaveBeenCalled();
    expect(mockedPostJson).toHaveBeenCalledWith('/api/staff-auth/logout', {});
  });

  it('fails (offline): shows an error toast, does not navigate, and re-enables the button', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: false, status: 0, body: null });

    render();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByText('Couldn’t sign you out. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
    // the button recovered — not stuck showing "Signing out…"
    expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeDisabled();
  });

  it('a second click while signing out is a no-op (no duplicate logout call)', async () => {
    let resolveLogout!: (v: { ok: boolean; status: number; body: unknown }) => void;
    mockedPostJson.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogout = resolve;
      }),
    );

    render();
    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    fireEvent.click(button); // still pending — must not fire a second logout

    expect(mockedPostJson).toHaveBeenCalledTimes(1);
    resolveLogout({ ok: true, status: 200, body: { data: { ok: true } } });
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF));
  });

  it("the account menu chevron rotates with the trigger's open/closed state", () => {
    render();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    // `group-data-[state=open]:...` only works if Radix's own `data-state`
    // ends up on this same element and it's marked `group` — a Tailwind CSS
    // selector, not something jsdom evaluates, so this asserts the wiring
    // (the class is on the right elements, the state actually flips), not
    // the rendered rotation itself.
    expect(trigger).toHaveClass('group');
    expect(trigger).toHaveAttribute('data-state', 'closed');
    const chevron = trigger.querySelector('svg')!;
    expect(chevron).toHaveClass('group-data-[state=open]:rotate-180');

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger).toHaveAttribute('data-state', 'open');
  });
});

describe('AdminShell nav — role-gated items', () => {
  it('Super Admin sees the Staff group (and the Administration section); expanding it shows List + Invite', () => {
    render(['SUPER_ADMIN']);
    expect(screen.getAllByText('Administration').length).toBeGreaterThan(0);
    const toggles = screen.getAllByRole('button', { name: 'Staff' });
    expect(toggles.length).toBeGreaterThan(0);
    // the collapsed group's list stays mounted (so the expand has something
    // to animate) but is `inert` — out of tab order and hit-testing
    const list = screen.getByRole('link', { name: 'List' }).closest('ul')!;
    expect(list).toHaveAttribute('inert');

    fireEvent.click(toggles[0]!);
    expect(list).not.toHaveAttribute('inert');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/staff',
    );
    expect(screen.getByRole('link', { name: 'Invite' })).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/staff/invite',
    );
  });

  it('already being on /staff/invite auto-expands the group and marks Invite current', () => {
    mockPathname = '/en/x7f2k9t3m1qp/staff/invite';
    render(['SUPER_ADMIN']);

    // no click needed — the active child alone opens the group
    const invite = screen.getByRole('link', { name: 'Invite' });
    expect(invite).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'List' })).not.toHaveAttribute('aria-current');
  });

  it('a normal Admin sees the Administration heading (for Audit log) but not the Staff group', () => {
    render(['ADMIN']);
    expect(screen.getAllByText('Administration').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Staff' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Audit log' }).length).toBeGreaterThan(0);
  });

  // Regression: `isOpen` used to be `expanded || anyChildActive`, and the
  // toggle button always flipped `expanded` on click. While on a child page
  // (`anyChildActive` true), that click has no visible effect — masked by
  // the `||` — but *does* still flip the hidden `expanded` bit, so leaving
  // the section afterwards landed on whichever state that bit's parity
  // happened to be, not anything the user could see coming. Clicking the
  // toggle while a child is active is now a no-op — `expanded` only ever
  // changes from outside the section — so however many times it's clicked
  // while inside, leaving always reflects the state from before entering.
  // `rerender` reconciles against the *previous* root, so every call here
  // goes through the same `AdminTestProviders` wrapper `renderAdmin` uses
  // internally — passing the bare `<AdminShell>` on its own would swap the
  // tree's root element type and force a full remount, silently resetting
  // `useSidebar`'s state and defeating the point of these two tests (that
  // state must survive a same-shell client-side navigation, the way it
  // does in the real app where `AdminShell` never remounts on route change).
  function shell(roles: string[] = ['SUPER_ADMIN']) {
    return (
      <AdminTestProviders>
        <AdminShell
          email="staff@example.com"
          roles={roles}
          root="/en/x7f2k9t3m1qp"
          loginHref={LOGIN_HREF}
        >
          <p>page content</p>
        </AdminShell>
      </AdminTestProviders>
    );
  }

  it('the toggle is a no-op while a child of the group is the active route — clicking it any number of times leaves the post-navigation state unchanged', () => {
    mockPathname = '/en/x7f2k9t3m1qp/staff';
    const { rerender } = rtlRender(shell());

    const toggle = screen.getAllByRole('button', { name: 'Staff' })[0]!;
    expect(toggle).toHaveAttribute('aria-expanded', 'true'); // forced open by the active child

    // three clicks — an odd number, the case that used to flip the parity
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true'); // still open, no visible change

    // navigate to an unrelated page — before this fix, an odd click count
    // here would have left the group open even though it was never
    // explicitly expanded from outside
    mockPathname = '/en/x7f2k9t3m1qp/catalog/categories';
    rerender(shell());

    expect(screen.getAllByRole('button', { name: 'Staff' })[0]!).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('the toggle still works normally from outside the section — clicking it expands/collapses, and that state survives entering and leaving the section', () => {
    mockPathname = '/en/x7f2k9t3m1qp'; // not under /staff at all
    const { rerender } = rtlRender(shell());

    const toggle = screen.getAllByRole('button', { name: 'Staff' })[0]!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // navigate into the section, then back out — the explicit "open" from
    // outside must still be there, undisturbed by anything the active-child
    // masking did in between
    mockPathname = '/en/x7f2k9t3m1qp/staff';
    rerender(shell());
    expect(screen.getAllByRole('button', { name: 'Staff' })[0]!).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    mockPathname = '/en/x7f2k9t3m1qp/catalog/categories';
    rerender(shell());
    expect(screen.getAllByRole('button', { name: 'Staff' })[0]!).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
