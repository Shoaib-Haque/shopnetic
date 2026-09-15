import type { NextResponse } from 'next/server';
import { callIdentityStaffApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';

/**
 * BFF proxy for the `staff:manage` staff-directory endpoints (list, role
 * change, unlock, reset-totp, deprovision) — `identity/v1/staff/*`, not the
 * `admin/v1/*` API surface `/api/admin/*` targets. Same Bearer-attach and
 * refresh-on-401 dance via `proxyWithBearer`.
 *
 * `[[...path]]` (optional catch-all), not `[...path]`: the list endpoint is
 * `identity/v1/staff` itself, zero extra segments — a required catch-all
 * doesn't match that at all and 404s before this handler ever runs.
 */
async function handle(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target =
    path && path.length > 0 ? `/${path.map(encodeURIComponent).join('/')}${search}` : search;

  const method = req.method.toUpperCase();
  const sendsBody = method !== 'GET' && method !== 'HEAD';
  const bodyText = sendsBody ? await req.text() : undefined;
  const contentType = req.headers.get('content-type');

  return proxyWithBearer((token) =>
    callIdentityStaffApi(target, {
      method,
      accessToken: token,
      ...(bodyText ? { body: bodyText, contentType } : {}),
    }),
  );
}

export { handle as GET, handle as POST, handle as PATCH };
