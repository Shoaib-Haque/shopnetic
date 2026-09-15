import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { postJson } from '../submit';
import { ForgotPasswordForm } from './forgot-password-form';

vi.mock('../submit', () => ({ postJson: vi.fn() }));

const mockedPostJson = vi.mocked(postJson);

function render() {
  return renderAdmin(<ForgotPasswordForm locale="en" basePath="x7f2k9t3m1qp" />);
}

function submitEmail(email = 'staff@example.com') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

afterEach(() => {
  cleanup();
  mockedPostJson.mockReset();
});

describe('ForgotPasswordForm', () => {
  it('vertical alignment: the form centers, the done message sits top-anchored', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    const { container } = render();
    expect(container.firstElementChild).toHaveClass('justify-center');

    submitEmail();
    await screen.findByText('Check your email');
    expect(container.firstElementChild).toHaveClass('pt-20');
  });

  it('success (202) → shows the same "check your email" copy regardless of whether the address exists', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    render();
    submitEmail();

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(
      screen.getByText(
        'If an account exists for that address, a reset link is on its way. The link expires in 1 hour.',
      ),
    ).toBeInTheDocument();
    expect(mockedPostJson).toHaveBeenCalledWith('/api/staff-auth/forgot-password', {
      email: 'staff@example.com',
    });
  });

  it('rate limited → shows the rate-limit copy, stays on the form', async () => {
    mockedPostJson.mockResolvedValueOnce({
      ok: false,
      status: 429,
      body: { error: { code: 'RATE_LIMITED' } },
    });

    render();
    submitEmail();

    expect(
      await screen.findByText('Too many attempts. Please wait a bit and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('offline → shows the network-error copy', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: false, status: 0, body: null });

    render();
    submitEmail();

    expect(
      await screen.findByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it('has a link back to sign in on both the form and the done state', async () => {
    mockedPostJson.mockResolvedValueOnce({ ok: true, status: 202, body: null });

    render();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/login',
    );

    submitEmail();
    expect(await screen.findByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/login',
    );
  });
});
