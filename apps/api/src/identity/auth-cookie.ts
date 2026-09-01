import type { CookieOptions, Response } from 'express';

/** Marketplace-plane refresh cookie. Staff plane will use a separate name. */
export const REFRESH_COOKIE = 'sn_rt';

/** Scope the cookie to the refresh + logout routes only. */
export const REFRESH_COOKIE_PATH = '/identity/v1/auth';

function baseOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  isProd: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(isProd), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, isProd: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(isProd));
}
