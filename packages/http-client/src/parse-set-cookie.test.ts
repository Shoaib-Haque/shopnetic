import { describe, expect, it } from 'vitest';
import { parseSetCookie } from './parse-set-cookie.js';

describe('parseSetCookie', () => {
  it('extracts a normal cookie value by name', () => {
    const line =
      'sn_rt=abc.def-123; Path=/identity/v1/auth; Expires=Thu, 01 Oct 2026 00:00:00 GMT; HttpOnly; SameSite=Lax';
    expect(parseSetCookie([line], 'sn_rt')).toEqual({ value: 'abc.def-123', cleared: false });
  });

  it('recognises a cleared cookie (empty value / epoch expiry / max-age=0)', () => {
    expect(parseSetCookie(['sn_rt=; Path=/identity/v1/auth; Max-Age=0'], 'sn_rt')).toEqual({
      cleared: true,
    });
    expect(parseSetCookie(['sn_rt=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], 'sn_rt')).toEqual({
      cleared: true,
    });
  });

  it('ignores unrelated cookies and returns not-cleared when absent', () => {
    expect(parseSetCookie(['other=1; Path=/', 'foo=bar'], 'sn_rt')).toEqual({ cleared: false });
    expect(parseSetCookie([], 'sn_rt')).toEqual({ cleared: false });
  });

  // The two real callers (admin's `sn_srt`, storefront's `sn_rt`) must stay
  // independent — a line for one cookie must never match the other name.
  it("is parameterized by cookie name — a different app's cookie never matches", () => {
    const staffLine = 'sn_srt=staff-token; Path=/identity/v1/staff/auth';
    expect(parseSetCookie([staffLine], 'sn_srt')).toEqual({ value: 'staff-token', cleared: false });
    expect(parseSetCookie([staffLine], 'sn_rt')).toEqual({ cleared: false });
  });
});
