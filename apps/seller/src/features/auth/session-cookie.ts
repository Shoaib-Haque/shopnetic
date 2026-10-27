import type { NextResponse } from 'next/server';
import { isProd } from '@/config/server-env';
import { readTokens } from './tokens';

export const SESSION_COOKIE = 'sn_seller_rt';
export const ACCESS_COOKIE = 'sn_seller_at';
const COOKIE_PATH = '/';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ACCESS_FALLBACK_MAX_AGE = 60 * 15; // 15 mins

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

export function applyAuthCookies(res: NextResponse, refreshToken: string, body: unknown): void {
  setSessionCookie(res, refreshToken);
  const tokens = readTokens(body);
  if (tokens) setAccessCookie(res, tokens.accessToken, tokens.expiresIn);
}
