import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { AcceptInviteForm } from './accept-invite-form';

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

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

const VALID_TOKEN = 'invite-token-1234567890';
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';

function render(token: string | null = VALID_TOKEN) {
  return renderAdmin(<AcceptInviteForm token={token} locale="en" basePath="x7f2k9t3m1qp" />);
}

function submitPassword(password = 'a-strong-password') {
  fireEvent.change(screen.getByLabelText('Create a password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('AcceptInviteForm', () => {
  it('no token → shows the invalid-invite message and renders no form', () => {
    render(null);

    expect(
      screen.getByText('This invite link is invalid or has already been used.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('breached password → shows the password-breached copy, stays on the form', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: { error: { code: 'PASSWORD_BREACHED' } },
    });

    render();
    submitPassword();

    expect(
      await screen.findByText(
        'This password has appeared in a data breach. Choose a different one.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Create a password')).toBeInTheDocument();
  });

  it('expired invite → shows the expired copy', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 410,
      body: { error: { code: 'INVITE_EXPIRED' } },
    });

    render();
    submitPassword();

    expect(await screen.findByText('This invite link has expired.')).toBeInTheDocument();
  });

  it('success (202) → shows the redirecting copy + a 3s timer bar, with no manual sign-in link', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    const { container } = render();
    submitPassword();

    expect(await screen.findByText('Redirecting to sign in…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // the same timer-bar primitive the toasts use (aria-hidden, so queried by
    // its animation style rather than an accessible role)
    const bar = container.querySelector('[style*="sn-toast-timer"]');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveStyle({ animation: 'sn-toast-timer 3000ms linear forwards' });
    expect(mockedPostJson).toHaveBeenCalledWith(
      '/api/staff-auth/accept-invite',
      expect.objectContaining({ token: VALID_TOKEN, password: 'a-strong-password' }),
    );
    expect(routerReplace).not.toHaveBeenCalled(); // not before the delay elapses
  });

  it('success (202) → auto-redirects to sign in after the delay, not before', async () => {
    vi.useFakeTimers();
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    render();
    submitPassword();
    // flush postJson()'s resolution and the resulting setDone(true) render
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Redirecting to sign in…')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(routerReplace).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF);
    expect(routerRefresh).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('success (202) → swaps the heading to the done state, not the "set a password" instruction', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    render();
    submitPassword();

    expect(await screen.findByRole('heading', { name: "You're all set" })).toBeInTheDocument();
    expect(
      screen.queryByText('Set a password for your new staff account.'),
    ).not.toBeInTheDocument();
  });

  it('no token → does not show the "set a password" instruction alongside the invalid-link error', () => {
    render(null);

    expect(
      screen.queryByText('Set a password for your new staff account.'),
    ).not.toBeInTheDocument();
  });
});
