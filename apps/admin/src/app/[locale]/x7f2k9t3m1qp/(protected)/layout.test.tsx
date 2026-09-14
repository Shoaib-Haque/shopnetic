import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// vi.mock is hoisted above imports/top-level consts — the mock fn itself must
// be created inside vi.hoisted so it exists by the time the factory runs.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation's real redirect() also works by throwing — it never returns.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('@/features/staff-auth/current-actor', () => ({ getCurrentStaff: vi.fn() }));
// AdminShell pulls in its own hooks/data deps unrelated to this guard — stub it
// so the test is only about the redirect decision.
vi.mock('@/components/layout/admin-shell', () => ({
  AdminShell: ({ email, children }: { email: string; children: ReactNode }) => (
    <div data-testid="shell" data-email={email}>
      {children}
    </div>
  ),
}));

import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import ProtectedLayout from './layout';

const mockedGetCurrentStaff = vi.mocked(getCurrentStaff);

afterEach(() => {
  cleanup();
  redirectMock.mockClear();
  mockedGetCurrentStaff.mockReset();
});

describe('ProtectedLayout', () => {
  it("no session → redirects to that locale/root's login page, never renders the shell", async () => {
    mockedGetCurrentStaff.mockResolvedValueOnce(null);

    await expect(
      ProtectedLayout({ children: <p>secret</p>, params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/x7f2k9t3m1qp/login');

    expect(redirectMock).toHaveBeenCalledWith('/en/x7f2k9t3m1qp/login');
  });

  it('valid session → renders the shell for that staff member, no redirect', async () => {
    mockedGetCurrentStaff.mockResolvedValueOnce({
      id: 'u1',
      email: 'staff@example.com',
      emailVerified: true,
    });

    const el = await ProtectedLayout({
      children: <p>secret content</p>,
      params: Promise.resolve({ locale: 'en' }),
    });
    render(el);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell')).toHaveAttribute('data-email', 'staff@example.com');
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});
