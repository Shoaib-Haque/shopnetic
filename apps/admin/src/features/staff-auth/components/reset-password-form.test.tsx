import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '../submit';
import { ResetPasswordForm } from './reset-password-form';

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
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);
const VALID_TOKEN = 'reset-token-1234567890';
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';

function render(token: string | null = VALID_TOKEN) {
  return renderAdmin(<ResetPasswordForm token={token} locale="en" basePath="x7f2k9t3m1qp" />);
}

function submitPasswords(newPassword = 'a-strong-password', confirm = newPassword) {
  fireEvent.change(screen.getByLabelText('Create a password'), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('ResetPasswordForm', () => {
  it('vertical alignment: a message state (no token) sits top-anchored, the form state centers', () => {
    const { container: invalidLink } = render(null);
    expect(invalidLink.firstElementChild).toHaveClass('pt-20');
    cleanup();

    const { container: form } = render();
    expect(form.firstElementChild).toHaveClass('justify-center');
  });

  it('no token → shows the invalid-link message and renders no form', () => {
    render(null);

    expect(
      screen.getByText('This reset link is invalid or has already been used.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('mismatched confirmation → validation error, never calls the API', async () => {
    render();
    submitPasswords('a-strong-password', 'a-different-password');

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('expired token → shows the expired copy', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 410,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_EXPIRED' } },
    });

    render();
    submitPasswords();

    expect(await screen.findByText('This reset link has expired.')).toBeInTheDocument();
  });

  it('already-used or unknown token → shows the invalid copy', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_INVALID' } },
    });

    render();
    submitPasswords();

    expect(
      await screen.findByText('This reset link is invalid or has already been used.'),
    ).toBeInTheDocument();
  });

  it('breached password → shows the password-breached copy, stays on the form', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: { error: { code: 'PASSWORD_BREACHED' } },
    });

    render();
    submitPasswords();

    expect(
      await screen.findByText(
        'This password has appeared in a data breach. Choose a different one.',
      ),
    ).toBeInTheDocument();
  });

  it('success (204) → shows the redirecting copy, then auto-redirects to sign in', async () => {
    vi.useFakeTimers();
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 204, body: null });

    const { container } = render();
    submitPasswords('a-strong-password');
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByText('Password reset')).toBeInTheDocument();
    expect(screen.getByText('Redirecting to sign in…')).toBeInTheDocument();
    // the done state is a message, not a form — top-anchored, not centered
    expect(container.firstElementChild).toHaveClass('pt-20');
    expect(mockedPostJson).toHaveBeenCalledWith('/api/staff-auth/reset-password', {
      token: VALID_TOKEN,
      newPassword: 'a-strong-password',
    });

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(routerReplace).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF);
    expect(routerRefresh).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
