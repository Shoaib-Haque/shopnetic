import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { getJson, postJson } from '../submit';
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

// forwards className/etc, not just href — a hover-class assertion on a
// rendered link needs it (matches admin-shell.test.tsx's own mock)
vi.mock('next/link', () => ({
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

vi.mock('../submit', () => ({ getJson: vi.fn(), postJson: vi.fn() }));

const mockedGetJson = vi.mocked(getJson);
const mockedPostJson = vi.mocked(postJson);
const VALID_TOKEN = 'reset-token-1234567890';
const LOGIN_HREF = '/en/x7f2k9t3m1qp/login';
const CHECK_OK = { ok: true, status: 200, body: { data: { valid: true } } };

/** Renders and waits past the mount-time status check (defaults to "still
 * good") into whichever state that check settles on — most tests care
 * about what's on screen *after* that check, not the brief instant before. */
async function render(token: string | null = VALID_TOKEN) {
  const result = renderAdmin(
    <ResetPasswordForm token={token} locale="en" basePath="x7f2k9t3m1qp" />,
  );
  await act(() => Promise.resolve());
  return result;
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
  mockedGetJson.mockResolvedValue(CHECK_OK);
});

afterEach(() => {
  cleanup();
  mockedGetJson.mockReset();
  mockedPostJson.mockReset();
});

describe('ResetPasswordForm — mount-time link check (before the form ever shows)', () => {
  it('briefly shows a checking state before the check resolves', () => {
    // never resolves during this test — the point is what shows up first
    mockedGetJson.mockReturnValue(new Promise(() => {}));
    renderAdmin(<ResetPasswordForm token={VALID_TOKEN} locale="en" basePath="x7f2k9t3m1qp" />);

    expect(screen.getByText('Checking your link…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
  });

  it('no token at all → invalid immediately, never calls the check endpoint', async () => {
    await render(null);

    // the message itself is the heading now — no separate "Choose a new
    // password" title above it (that's the action this screen is saying
    // isn't available, so pairing them read as mismatched). Queried by
    // `role="alert"`, not `role="heading"` — the explicit `alert` role
    // (so screen readers announce it) replaces the `<h1>`'s implicit
    // heading role rather than stacking with it.
    expect(screen.getByRole('alert')).toHaveTextContent('This reset link is invalid.');
    expect(screen.queryByText('Choose a new password')).not.toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: 'Back to sign in' });
    expect(backLink).toHaveAttribute('href', LOGIN_HREF);
    // the shared `@shopnetic/ui` `Link`'s default hover treatment — was
    // missing on this specific (invalid/expired) screen's link before
    // 2026-09-17
    expect(backLink).toHaveClass('hover:text-foreground');
    expect(mockedGetJson).not.toHaveBeenCalled();
  });

  it('an already-used token → the calm message straight away, no form ever shown', async () => {
    mockedGetJson.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_ALREADY_USED' } },
    });

    await render();

    expect(screen.getByText('Already reset')).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('an expired token → the expired message straight away, with a way back to login', async () => {
    mockedGetJson.mockResolvedValueOnce({
      ok: false,
      status: 410,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_EXPIRED' } },
    });

    await render();

    expect(screen.getByText('This reset link has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      LOGIN_HREF,
    );
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
  });

  it('an unknown token → the generic invalid message straight away', async () => {
    mockedGetJson.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_INVALID' } },
    });

    await render();

    expect(screen.getByText('This reset link is invalid.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
  });

  it('a still-good token → the form, with a way back to login without submitting anything', async () => {
    await render();

    expect(screen.getByLabelText('Create a password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      LOGIN_HREF,
    );
  });
});

describe('ResetPasswordForm — submitting the form', () => {
  it('vertical alignment: a message state sits top-anchored, the form state centers', async () => {
    mockedGetJson.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_INVALID' } },
    });
    const { container: invalidLink } = await render();
    expect(invalidLink.firstElementChild).toHaveClass('pt-20');
    cleanup();

    const { container: form } = await render();
    expect(form.firstElementChild).toHaveClass('justify-center');
  });

  it('mismatched confirmation → validation error, never calls the API', async () => {
    await render();
    submitPasswords('a-strong-password', 'a-different-password');

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('a dead-token code discovered only at submit time (raced past the mount check) gets the same dedicated screen', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 410,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_EXPIRED' } },
    });

    await render();
    submitPasswords();

    expect(await screen.findByText('This reset link has expired.')).toBeInTheDocument();
    // a screen now, not an inline error — the form is gone
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
  });

  it('breached password → shows the password-breached copy, stays on the form', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: { error: { code: 'PASSWORD_BREACHED' } },
    });

    await render();
    submitPasswords();

    expect(
      await screen.findByText(
        'This password has appeared in a data breach. Choose a different one.',
      ),
    ).toBeInTheDocument();
    // a fixable-on-this-form error — stays on the form, unlike a dead token
    expect(screen.getByLabelText('Create a password')).toBeInTheDocument();
  });

  it('success (204) → shows the redirecting copy, then auto-redirects to sign in', async () => {
    vi.useFakeTimers();
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 204, body: null });

    const { container } = await render();
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

  it('already-used token discovered at submit (e.g. a double-click) → the calm message screen, auto-redirects', async () => {
    vi.useFakeTimers();
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: { code: 'PASSWORD_RESET_TOKEN_ALREADY_USED' } },
    });

    const { container } = await render();
    submitPasswords();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByText('Already reset')).toBeInTheDocument();
    expect(
      screen.getByText(
        "This link was already used — your password's already been changed. Sign in with your new one.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    // message screen, not a form error — top-anchored like `done`, not centered
    expect(container.firstElementChild).toHaveClass('pt-20');

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(routerReplace).toHaveBeenCalledWith(LOGIN_HREF);

    vi.useRealTimers();
  });
});
