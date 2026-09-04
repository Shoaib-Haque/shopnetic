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
import { callAdminApi, refreshStaffTokens, type AdminApiResult } from '@/features/admin-api/bridge';

/**
 * BFF proxy for the protected `/admin/v1/*` API. The browser calls
 * `/api/admin/<path>`; this attaches the `sn_sat` Bearer token, and — when it is
 * missing or the API answers `401` — silently refreshes it from `sn_srt` (which
 * rotates), retries once, and writes the new cookies back. No token ever reaches
 * the browser.
 */
async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = `/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`;

  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(SESSION_COOKIE)?.value;
  if (!access && !refresh) return unauthorized();

  const method = req.method.toUpperCase();
  const sendsBody = method !== 'GET' && method !== 'HEAD';
  const bodyText = sendsBody ? await req.text() : undefined;
  const contentType = req.headers.get('content-type');

  const call = (token: string): Promise<AdminApiResult> =>
    callAdminApi(target, {
      method,
      accessToken: token,
      ...(bodyText ? { body: bodyText, contentType } : {}),
    });

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

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
