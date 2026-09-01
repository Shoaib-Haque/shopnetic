import { describe, expect, it } from 'vitest';
import { parseRefreshSetCookie } from './parse-set-cookie';
import { authErrorKey, extractErrorCode } from './error-copy';

describe('parseRefreshSetCookie', () => {
  it('extracts the sn_rt value from a normal Set-Cookie line', () => {
    const line =
      'sn_rt=abc.def-123; Path=/identity/v1/auth; Expires=Thu, 01 Oct 2026 00:00:00 GMT; HttpOnly; SameSite=Lax';
    expect(parseRefreshSetCookie([line])).toEqual({ value: 'abc.def-123', cleared: false });
  });

  it('recognises a cleared cookie (empty value / epoch expiry / max-age=0)', () => {
    expect(parseRefreshSetCookie(['sn_rt=; Path=/identity/v1/auth; Max-Age=0'])).toEqual({
      cleared: true,
    });
    expect(parseRefreshSetCookie(['sn_rt=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toEqual({
      cleared: true,
    });
  });

  it('ignores unrelated cookies and returns not-cleared when absent', () => {
    expect(parseRefreshSetCookie(['other=1; Path=/', 'foo=bar'])).toEqual({ cleared: false });
    expect(parseRefreshSetCookie([])).toEqual({ cleared: false });
  });
});

describe('auth error copy', () => {
  it('maps known codes to namespaced keys and unknown to generic', () => {
    expect(authErrorKey('INVALID_CREDENTIALS')).toBe('errors.invalidCredentials');
    expect(authErrorKey('EMAIL_NOT_VERIFIED')).toBe('errors.emailNotVerified');
    expect(authErrorKey('SOMETHING_NEW')).toBe('errors.generic');
    expect(authErrorKey(undefined)).toBe('errors.generic');
  });

  it('pulls the code out of an RFC-9457 error body', () => {
    expect(extractErrorCode({ error: { code: 'RATE_LIMITED' } })).toBe('RATE_LIMITED');
    expect(extractErrorCode({ data: {} })).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
  });
});
