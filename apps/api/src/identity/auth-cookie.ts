import type { CookieOptions, Response } from 'express';

/** Marketplace-plane refresh cookie. */
export const REFRESH_COOKIE = 'sn_rt';
export const REFRESH_COOKIE_PATH = '/identity/v1/auth';

/** Staff-plane refresh cookie — separate name + path so the two never mix. */
export const STAFF_REFRESH_COOKIE = 'sn_srt';
export const STAFF_REFRESH_COOKIE_PATH = '/identity/v1/staff/auth';

function baseOptions(path: string, isProd: boolean): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  isProd: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(REFRESH_COOKIE_PATH, isProd),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response, isProd: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(REFRESH_COOKIE_PATH, isProd));
}

export function setStaffRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  isProd: boolean,
): void {
  res.cookie(STAFF_REFRESH_COOKIE, token, {
    ...baseOptions(STAFF_REFRESH_COOKIE_PATH, isProd),
    expires: expiresAt,
  });
}

export function clearStaffRefreshCookie(res: Response, isProd: boolean): void {
  res.clearCookie(STAFF_REFRESH_COOKIE, baseOptions(STAFF_REFRESH_COOKIE_PATH, isProd));
}
