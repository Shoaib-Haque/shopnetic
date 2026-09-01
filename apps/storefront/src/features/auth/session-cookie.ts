import type { NextResponse } from 'next/server';
import { isProd } from '@/config/server-env';

/**
 * The storefront's own copy of the refresh token. The identity API scopes its
 * cookie to `/identity/v1/auth`; the BFF terminates that and re-issues this one
 * scoped to the storefront's `/api/auth` routes.
 */
export const SESSION_COOKIE = 'sn_rt';
const COOKIE_PATH = '/api/auth';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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
