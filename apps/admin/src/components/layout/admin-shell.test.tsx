import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
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
});
