import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { StaffLoginForm } from './login-form';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();
// per-test control over what `useSearchParams().get('next')` returns
let nextParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: routerRefresh,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? nextParam : null) }),
}));

// next/link reads AppRouterContext, which isn't mounted here — a plain <a> is enough.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

const DASHBOARD = '/en/x7f2k9t3m1qp';

function render() {
  return renderAdmin(<StaffLoginForm locale="en" basePath="x7f2k9t3m1qp" />);
}

function fillCredentials(email = 'staff@example.com', password = 'correct-horse-battery') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

beforeEach(() => {
  nextParam = null;
  routerReplace.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('StaffLoginForm', () => {
  it('wrong credentials → shows the invalid-credentials message, stays on the password step', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS' } },
    });

    render();
    fillCredentials(undefined, 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText("That email and password don't match.")).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument(); // still the password step
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('network failure (status 0) → shows the distinct "couldn\'t reach the server" copy, not the generic one', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: false, status: 0, body: null });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('locked account → shows the account-locked copy and does not advance past the password step', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 403,
      body: { error: { code: 'ACCOUNT_LOCKED' } },
    });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/This account isn't available/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('first login → TOTP enrolment → recovery codes → Continue redirects to the dashboard', async () => {
    mockedPostJson
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          data: {
            status: 'totp_enrolment_required',
            secret: 'ABC123SECRET',
            otpauthUri: 'otpauth://totp/Shopnetic:staff@example.com?secret=ABC123SECRET',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { data: { recoveryCodes: ['recovery-one', 'recovery-two'] } },
      });

    render();
    fillCredentials('new@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // enrol step
    expect(await screen.findByText('ABC123SECRET')).toBeInTheDocument();
    expect(screen.getByText(/First sign-in: add this account/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign in' }));

    // recovery step
    expect(await screen.findByText('recovery-one')).toBeInTheDocument();
    expect(screen.getByText('recovery-two')).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled(); // not until the user acknowledges the codes

    fireEvent.click(screen.getByRole('button', { name: 'Continue to the dashboard' }));
    expect(routerReplace).toHaveBeenCalledWith(DASHBOARD);

    // the confirm call carried the credentials + the entered code
    expect(mockedPostJson).toHaveBeenNthCalledWith(
      2,
      '/api/staff-auth/totp-confirm',
      expect.objectContaining({ email: 'new@example.com', code: '123456' }),
    );
  });

  it('returning MFA user → mfa step → submitting the code retries login with it and redirects', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { data: { user: { id: 'u1' } } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Enter the 6-digit code/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(DASHBOARD));
    expect(mockedPostJson).toHaveBeenLastCalledWith(
      '/api/staff-auth/login',
      expect.objectContaining({ code: '654321' }),
    );
  });

  describe('?next= redirect guard', () => {
    const succeed = () =>
      mockedPostJson.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { data: { user: { id: 'u1' } } },
      });

    async function signInAndGetDestination(): Promise<string> {
      render();
      fillCredentials();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(routerReplace).toHaveBeenCalled());
      return routerReplace.mock.calls[0]?.[0] as string;
    }

    it('ignores an absolute off-app URL, falls back to the dashboard', async () => {
      nextParam = 'https://evil.example.com/phish';
      succeed();
      expect(await signInAndGetDestination()).toBe(DASHBOARD);
    });

    it('ignores a path that only looks like it starts under the admin root', async () => {
      nextParam = '/en/x7f2k9t3m1qp-evil/steal';
      succeed();
      expect(await signInAndGetDestination()).toBe(DASHBOARD);
    });

    it('honors a path genuinely inside the admin root', async () => {
      nextParam = '/en/x7f2k9t3m1qp/catalog/categories';
      succeed();
      expect(await signInAndGetDestination()).toBe('/en/x7f2k9t3m1qp/catalog/categories');
    });
  });
});
