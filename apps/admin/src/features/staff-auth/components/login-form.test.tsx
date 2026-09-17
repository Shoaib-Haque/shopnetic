import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { StaffLoginForm } from './login-form';

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

// next/link reads AppRouterContext, which isn't mounted here — a plain <a> is enough.
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

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

const DASHBOARD = '/en/x7f2k9t3m1qp';

function render(next: string | null = null) {
  return renderAdmin(<StaffLoginForm locale="en" basePath="x7f2k9t3m1qp" next={next} />);
}

function fillCredentials(email = 'staff@example.com', password = 'correct-horse-battery') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

/** Paste a code into the segmented OtpInput's first cell (spreads across cells). */
function pasteOtp(text: string) {
  const group = screen.getByRole('group', { name: 'Authenticator code' });
  const firstCell = within(group).getAllByRole('textbox')[0]!;
  fireEvent.focus(firstCell);
  fireEvent.paste(firstCell, { clipboardData: { getData: () => text } });
}

beforeEach(() => {
  routerReplace.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('StaffLoginForm', () => {
  it('the forgot-password and accept-invite links both have the shared hover state', () => {
    render();
    // "Accept an invite" was a bare `underline` with no hover feedback
    // before the shared `@shopnetic/ui` `Link` fix (2026-09-17); "Forgot
    // your password?" already had it, kept here as the working reference
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveClass(
      'hover:text-foreground',
    );
    expect(screen.getByRole('link', { name: 'Accept an invite' })).toHaveClass(
      'hover:text-foreground',
    );
  });

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

  it('rate limited → shows the rate-limited copy and stays on the password step', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 429,
      body: { error: { code: 'RATE_LIMITED' } },
    });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Too many attempts. Please wait a bit and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
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
    expect(screen.getByText(/First sign-in: scan this/)).toBeInTheDocument();

    pasteOtp('123456'); // reaching 6 digits auto-submits the confirm

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

  it('enrol screen shows a QR for the otpauth URI, with the secret behind a manual-entry fallback', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        data: {
          status: 'totp_enrolment_required',
          secret: 'ABC123SECRET',
          otpauthUri: 'otpauth://totp/Shopnetic:staff@example.com?secret=ABC123SECRET',
        },
      },
    });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // qrcode's encoder runs for real here (no canvas needed) — a genuine PNG
    // data URI, not just a wiring stub
    const qr = await screen.findByRole('img', { name: /QR code/i });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    // the secret is present but tucked behind the manual-entry disclosure, not
    // shown as the primary path
    expect(screen.getByText("Can't scan? Enter the code manually")).toBeInTheDocument();
  });

  it('enrol step: confirming after the account got enrolled elsewhere → shows the already-enrolled copy, stays on the enrol step', async () => {
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
        ok: false,
        status: 409,
        body: { error: { code: 'MFA_ALREADY_ENROLLED' } },
      });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('ABC123SECRET');

    pasteOtp('123456');

    expect(
      await screen.findByText('An authenticator is already set up for this account.'),
    ).toBeInTheDocument();
    expect(screen.getByText('ABC123SECRET')).toBeInTheDocument(); // still the enrol step
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('returning MFA user → mfa step → submitting the code retries login with it and redirects', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { data: { user: { id: 'u1' } } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Enter the 6-digit code/)).toBeInTheDocument();

    pasteOtp('654321'); // 6 digits → auto-submits the retry

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(DASHBOARD));
    expect(mockedPostJson).toHaveBeenLastCalledWith(
      '/api/staff-auth/login',
      expect.objectContaining({ code: '654321' }),
    );
  });

  it('MFA step: wrong code → shows the invalid-code message and stays on the MFA step', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_INVALID' } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Enter the 6-digit code/);

    pasteOtp('000000');

    expect(await screen.findByText("That code isn't right. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Authenticator code' })).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('MFA step: wrong recovery code → shows the invalid-code message and stays on the recovery field', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_INVALID' } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Enter the 6-digit code/);

    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'WRONG-CODE1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText("That code isn't right. Try again.")).toBeInTheDocument();
    // stays in recovery mode — a failed attempt must not silently flip back
    // to the authenticator-app field
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('MFA step: non-digits are rejected and a partial code keeps the button disabled', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { error: { code: 'MFA_REQUIRED' } },
    });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Enter the 6-digit code/);

    pasteOtp('12ab34'); // only the 4 digits land
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    const cells = within(screen.getByRole('group', { name: 'Authenticator code' })).getAllByRole(
      'textbox',
    ) as HTMLInputElement[];
    expect(cells.map((c) => c.value).join('')).toBe('1234');
  });

  it('MFA step: typing a digit at a time auto-advances focus through all 6 cells', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { data: { user: { id: 'u1' } } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Enter the 6-digit code/);

    const cells = within(screen.getByRole('group', { name: 'Authenticator code' })).getAllByRole(
      'textbox',
    ) as HTMLInputElement[];

    for (const [i, digit] of ['1', '2', '3', '4', '5'].entries()) {
      fireEvent.change(cells[i]!, { target: { value: digit } });
      // typing one digit must hand focus to the *next* cell, not bounce back
      expect(document.activeElement).toBe(cells[i + 1]);
    }
    fireEvent.change(cells[5]!, { target: { value: '6' } }); // 6th digit auto-submits

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(DASHBOARD));
    expect(mockedPostJson).toHaveBeenLastCalledWith(
      '/api/staff-auth/login',
      expect.objectContaining({ code: '123456' }),
    );
  });

  it('MFA step: "use a recovery code" swaps in a plain field and submits the recovery code', async () => {
    mockedPostJson
      .mockResolvedValueOnce({ ok: false, status: 401, body: { error: { code: 'MFA_REQUIRED' } } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { data: { user: { id: 'u1' } } } });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Enter the 6-digit code/);

    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    expect(screen.queryByRole('group', { name: 'Authenticator code' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'A3F9K-2M7QP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(DASHBOARD));
    expect(mockedPostJson).toHaveBeenLastCalledWith(
      '/api/staff-auth/login',
      expect.objectContaining({ code: 'A3F9K-2M7QP' }),
    );
  });

  it('on a successful login the button stays in its pending state through the redirect', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { data: { user: { id: 'u1' } } },
    });

    render();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // the response has landed (redirect fired) but the form is still mounted —
    // the button must not have snapped back to idle in the gap before the
    // dashboard renders.
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    // the submit button is still the loading one (name = "Loading" + loadingText
    // from the Button/Spinner composition), not back to "Sign in"
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  describe('?next= redirect guard', () => {
    const succeed = () =>
      mockedPostJson.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { data: { user: { id: 'u1' } } },
      });

    async function signInAndGetDestination(next: string | null): Promise<string> {
      render(next);
      fillCredentials();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(routerReplace).toHaveBeenCalled());
      return routerReplace.mock.calls[0]?.[0] as string;
    }

    it('ignores an absolute off-app URL, falls back to the dashboard', async () => {
      succeed();
      expect(await signInAndGetDestination('https://evil.example.com/phish')).toBe(DASHBOARD);
    });

    it('ignores a path that only looks like it starts under the admin root', async () => {
      succeed();
      expect(await signInAndGetDestination('/en/x7f2k9t3m1qp-evil/steal')).toBe(DASHBOARD);
    });

    it('honors a path genuinely inside the admin root', async () => {
      succeed();
      expect(await signInAndGetDestination('/en/x7f2k9t3m1qp/catalog/categories')).toBe(
        '/en/x7f2k9t3m1qp/catalog/categories',
      );
    });
  });
});
