import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { AcceptInviteForm } from './accept-invite-form';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

const VALID_TOKEN = 'invite-token-1234567890';

function render(token: string | null = VALID_TOKEN) {
  return renderAdmin(<AcceptInviteForm token={token} locale="en" basePath="x7f2k9t3m1qp" />);
}

function submitPassword(password = 'a-strong-password') {
  fireEvent.change(screen.getByLabelText('Create a password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

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

  it('success (202) → shows the done state with a link back to sign in', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    render();
    submitPassword();

    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Go to sign in' });
    expect(link).toHaveAttribute('href', '/en/x7f2k9t3m1qp/login');
    expect(screen.queryByLabelText('Create a password')).not.toBeInTheDocument();
    expect(mockedPostJson).toHaveBeenCalledWith(
      '/api/staff-auth/accept-invite',
      expect.objectContaining({ token: VALID_TOKEN, password: 'a-strong-password' }),
    );
  });
});
