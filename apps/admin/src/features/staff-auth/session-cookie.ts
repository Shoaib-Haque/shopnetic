import type { NextResponse } from 'next/server';
import { isProd } from '@/config/server-env';

/**
 * The admin app's own copy of the staff refresh token. The identity API scopes
 * its cookie to `/identity/v1/staff/auth`; the BFF terminates that and re-issues
 * this one. Path `/` (not `/api/staff-auth`) so the server-side session check in
 * the `(protected)` page layout also receives it. 8h to match the API.
 */
export const SESSION_COOKIE = 'sn_srt';
const COOKIE_PATH = '/';
const MAX_AGE_SECONDS = 60 * 60 * 8;

export function setSessionCookie(res: NextResponse, value: string): void {
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 0,
  });
}
