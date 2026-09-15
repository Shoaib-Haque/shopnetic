import { afterEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation's real redirect() also works by throwing — it never returns.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// the module under test is server-only; jsdom otherwise treats it as a
// Client Component context and the real package throws on import
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('./current-actor', () => ({ getCurrentStaff: vi.fn() }));

import { getCurrentStaff } from './current-actor';
import { redirectIfSignedIn } from './redirect-if-signed-in';

const mockedGetCurrentStaff = vi.mocked(getCurrentStaff);

afterEach(() => {
  redirectMock.mockClear();
  mockedGetCurrentStaff.mockReset();
});

describe('redirectIfSignedIn', () => {
  it("already signed in → redirects to that locale's dashboard", async () => {
    mockedGetCurrentStaff.mockResolvedValueOnce({
      id: 'u1',
      email: 'staff@example.com',
      emailVerified: true,
    });

    await expect(redirectIfSignedIn('en')).rejects.toThrow('NEXT_REDIRECT:/en/x7f2k9t3m1qp');
    expect(redirectMock).toHaveBeenCalledWith('/en/x7f2k9t3m1qp');
  });

  it('no session → resolves without redirecting', async () => {
    mockedGetCurrentStaff.mockResolvedValueOnce(null);

    await expect(redirectIfSignedIn('en')).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
