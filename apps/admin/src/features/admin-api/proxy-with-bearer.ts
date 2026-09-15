import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  SESSION_COOKIE,
  clearAccessCookie,
  clearSessionCookie,
  setAccessCookie,
  setSessionCookie,
} from '@/features/staff-auth/session-cookie';
import { refreshStaffTokens, type AdminApiResult } from './bridge';

/**
 * The Bearer-token dance shared by every BFF route that calls a protected
 * staff endpoint: attach `sn_sat`, and when it's missing or the call comes
 * back `401`, silently refresh it from `sn_srt` (which rotates), retry once,
 * and write the new cookies back. No token ever reaches the browser.
 */
export async function proxyWithBearer(
  call: (accessToken: string) => Promise<AdminApiResult>,
): Promise<NextResponse> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(SESSION_COOKIE)?.value;
  if (!access && !refresh) return unauthorized();

  let result: AdminApiResult | undefined;
  if (access) result = await call(access);

  let refreshedAccess: { token: string; expiresIn: number } | undefined;
  let rotatedRefresh: string | undefined;
  if ((!result || result.status === 401) && refresh) {
    const refreshed = await refreshStaffTokens(refresh);
    if (!refreshed) return unauthorized(true);
    refreshedAccess = { token: refreshed.accessToken, expiresIn: refreshed.expiresIn };
    rotatedRefresh = refreshed.refreshToken;
    result = await call(refreshed.accessToken);
  }
  if (!result) return unauthorized();

  const res =
    result.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(result.body ?? null, { status: result.status });

  if (refreshedAccess) setAccessCookie(res, refreshedAccess.token, refreshedAccess.expiresIn);
  if (rotatedRefresh) setSessionCookie(res, rotatedRefresh);
  if (result.status === 401) clearAccessCookie(res);
  return res;
}

function unauthorized(clearAll = false): NextResponse {
  const res = NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (clearAll) {
    clearAccessCookie(res);
    clearSessionCookie(res);
  }
  return res;
}
