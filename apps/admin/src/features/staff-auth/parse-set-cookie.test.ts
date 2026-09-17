import { describe, expect, it } from 'vitest';
import { parseStaffSetCookie } from './parse-set-cookie';
import { extractErrorCode, staffErrorKey } from './error-copy';

describe('parseStaffSetCookie', () => {
  it('extracts the sn_srt value from a normal Set-Cookie line', () => {
    const line =
      'sn_srt=abc.def-123; Path=/identity/v1/staff/auth; Expires=Thu, 01 Oct 2026 00:00:00 GMT; HttpOnly; SameSite=Lax';
    expect(parseStaffSetCookie([line])).toEqual({ value: 'abc.def-123', cleared: false });
  });

  it('recognises a cleared cookie (empty value / epoch expiry / max-age=0)', () => {
    expect(parseStaffSetCookie(['sn_srt=; Path=/identity/v1/staff/auth; Max-Age=0'])).toEqual({
      cleared: true,
    });
    expect(parseStaffSetCookie(['sn_srt=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toEqual({
      cleared: true,
    });
  });

  it('ignores unrelated cookies and returns not-cleared when absent', () => {
    expect(parseStaffSetCookie(['other=1; Path=/', 'foo=bar'])).toEqual({ cleared: false });
    expect(parseStaffSetCookie([])).toEqual({ cleared: false });
  });

  // The storefront's own `sn_rt` cookie must never be mistaken for this one.
  it("does not match the storefront's sn_rt cookie", () => {
    expect(parseStaffSetCookie(['sn_rt=buyer-token; Path=/'])).toEqual({ cleared: false });
  });
});

describe('staff error copy', () => {
  it('maps known codes to namespaced keys and unknown to generic', () => {
    expect(staffErrorKey('INVALID_CREDENTIALS')).toBe('errors.invalidCredentials');
    expect(staffErrorKey('MFA_REQUIRED')).toBe('errors.mfaRequired');
    expect(staffErrorKey('SOMETHING_NEW')).toBe('errors.generic');
    expect(staffErrorKey(undefined)).toBe('errors.generic');
  });

  it('pulls the code out of an RFC-9457-ish error body', () => {
    expect(extractErrorCode({ error: { code: 'RATE_LIMITED' } })).toBe('RATE_LIMITED');
    expect(extractErrorCode({ data: {} })).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
  });
});
