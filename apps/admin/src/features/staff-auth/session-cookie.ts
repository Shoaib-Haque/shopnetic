import type { NextResponse } from 'next/server';
import { isProd } from '@/config/server-env';

/**
 * The admin app's own copy of the staff refresh token. The identity API scopes
 * its cookie to `/identity/v1/staff/auth`; the BFF terminates that and re-issues
 * this one. Path `/` (not `/api/staff-auth`) so the server-side session check in
 * the `(protected)` page layout also receives it. 8h to match the API.
 */
export const SESSION_COOKIE = 'sn_srt';
/**
 * The staff **access** token (`aud=admin` JWT). Held by the BFF so the
 * `/api/admin/*` proxy can call the protected `/admin/v1/*` API. Short-lived
 * (matches `JWT_ACCESS_TTL_SECONDS`); the proxy silently refreshes it from
 * `sn_srt` when it expires.
 */
export const ACCESS_COOKIE = 'sn_sat';
const COOKIE_PATH = '/';
const MAX_AGE_SECONDS = 60 * 60 * 8;
const ACCESS_FALLBACK_MAX_AGE = 60 * 15;

const base = { httpOnly: true, secure: isProd, sameSite: 'lax', path: COOKIE_PATH } as const;

export function setSessionCookie(res: NextResponse, value: string): void {
  res.cookies.set(SESSION_COOKIE, value, { ...base, maxAge: MAX_AGE_SECONDS });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { ...base, maxAge: 0 });
}

export function setAccessCookie(res: NextResponse, value: string, expiresInSeconds?: number): void {
  const maxAge = Math.max(
    30,
    Math.min(expiresInSeconds ?? ACCESS_FALLBACK_MAX_AGE, MAX_AGE_SECONDS),
  );
  res.cookies.set(ACCESS_COOKIE, value, { ...base, maxAge });
}

export function clearAccessCookie(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
}
