import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '@/features/staff-auth/submit';
import { InviteStaffForm } from './invite-staff-form';

vi.mock('@/features/staff-auth/submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

function fillEmail(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

describe('InviteStaffForm', () => {
  it('invalid email → shows the format error and never calls the API', async () => {
    renderAdmin(<InviteStaffForm />);
    fillEmail('not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('success → toasts the sent-to copy, sends the selected role, and clears the email field', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: true,
      status: 202,
      body: { data: { email: 'new-admin@example.com' } },
    });

    renderAdmin(<InviteStaffForm />);
    fillEmail('new-admin@example.com');
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'SUPER_ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Invite sent to new-admin@example.com.')).toBeInTheDocument();
    expect(mockedPostJson).toHaveBeenCalledWith('/api/staff-auth/invite', {
      email: 'new-admin@example.com',
      role: 'SUPER_ADMIN',
    });
    expect(screen.getByLabelText('Email')).toHaveValue('');
    // the role choice is kept across a reset — only the one-shot email clears
    expect(screen.getByLabelText('Role')).toHaveValue('SUPER_ADMIN');
  });

  it('email already taken → shows that specific copy, not the generic one', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 409,
      body: { error: { code: 'INVITE_EMAIL_TAKEN' } },
    });

    renderAdmin(<InviteStaffForm />);
    fillEmail('taken@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('forbidden (not a Super Admin) → shows the permission copy', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 403,
      body: { error: { code: 'FORBIDDEN' } },
    });

    renderAdmin(<InviteStaffForm />);
    fillEmail('new-admin@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Only a Super Admin can do that.')).toBeInTheDocument();
  });

  it('network failure (status 0) → shows the distinct offline copy, not the generic one', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: false, status: 0, body: null });

    renderAdmin(<InviteStaffForm />);
    fillEmail('new-admin@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      await screen.findByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });
});
