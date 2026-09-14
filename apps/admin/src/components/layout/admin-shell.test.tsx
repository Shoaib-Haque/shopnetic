import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { AdminShell } from './admin-shell';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: routerRefresh,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/en/x7f2k9t3m1qp',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';

function render() {
  return renderAdmin(
    <AdminShell email="staff@example.com" root="/en/x7f2k9t3m1qp" loginHref={LOGIN_HREF}>
      <p>page content</p>
    </AdminShell>,
  );
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
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
});
