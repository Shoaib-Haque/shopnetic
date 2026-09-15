import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { ChangePasswordForm } from './change-password-form';

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
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';

function render() {
  return renderAdmin(<ChangePasswordForm loginHref={LOGIN_HREF} />);
}

function fillAndSubmit({
  current = 'the-old-password',
  next = 'a-strong-new-password',
  confirm = next,
}: { current?: string; next?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Create a password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('ChangePasswordForm', () => {
  it('mismatched confirmation → validation error, never calls the API', async () => {
    render();
    fillAndSubmit({ next: 'a-strong-new-password', confirm: 'a-different-password' });

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('wrong current password (401 INVALID_CREDENTIALS) → shows the context-specific copy, not the login-page wording', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS' } },
    });

    render();
    fillAndSubmit();

    // inline under the Current password field (H4: every field shows its
    // own error), not a generic banner above the submit button — check the
    // error text's *direct* parent is that field's own wrapper div, not
    // just "somewhere on the same page" (a page-level banner would also be
    // a technically-true-but-meaningless match for a looser containment check)
    const errorText = await screen.findByText('Your current password is incorrect.');
    const fieldWrapper = screen.getByLabelText('Current password').closest('div')!.parentElement!;
    expect(errorText.parentElement).toBe(fieldWrapper);
    expect(screen.queryByText("That email and password don't match.")).not.toBeInTheDocument();
  });

  it('breached new password → shows the password-breached copy, stays on the form', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: { error: { code: 'PASSWORD_BREACHED' } },
    });

    render();
    fillAndSubmit();

    // inline under "Create a password" (the new-password field it's about),
    // not a generic banner — same direct-parent check as above
    const errorText = await screen.findByText(
      'This password has appeared in a data breach. Choose a different one.',
    );
    const fieldWrapper = screen.getByLabelText('Create a password').closest('div')!.parentElement!;
    expect(errorText.parentElement).toBe(fieldWrapper);
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  });

  it('offline (status 0) → shows the network-error copy', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: false, status: 0, body: null });

    render();
    fillAndSubmit();

    expect(
      await screen.findByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it('success (204) → shows the redirecting copy, then auto-redirects to sign in after the delay', async () => {
    vi.useFakeTimers();
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 204, body: null });

    const { container } = render();
    fillAndSubmit({ current: 'the-old-password', next: 'a-strong-new-password' });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByText('Password changed')).toBeInTheDocument();
    expect(screen.getByText('Redirecting to sign in…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    // a full-screen overlay, above the sidebar's mobile-drawer z-40 — the
    // shell's nav must not be visible or clickable once sessions are being
    // revoked and a redirect to login is already in flight
    expect(container.firstElementChild).toHaveClass('fixed', 'inset-0', 'z-50');
    expect(mockedPostJson).toHaveBeenCalledWith('/api/staff-auth/change-password', {
      currentPassword: 'the-old-password',
      newPassword: 'a-strong-new-password',
    });

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(routerReplace).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF);
    expect(routerRefresh).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
