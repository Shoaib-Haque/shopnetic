import type { NextResponse } from 'next/server';
import { callAdminApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';

/**
 * BFF proxy for the protected `/admin/v1/*` API. The browser calls
 * `/api/admin/<path>`; `proxyWithBearer` attaches the `sn_sat` Bearer token and
 * handles the refresh-on-401 dance (see its own doc comment).
 */
async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = `/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`;

  const method = req.method.toUpperCase();
  const sendsBody = method !== 'GET' && method !== 'HEAD';
  const bodyText = sendsBody ? await req.text() : undefined;
  const contentType = req.headers.get('content-type');

  return proxyWithBearer((token) =>
    callAdminApi(target, {
      method,
      accessToken: token,
      ...(bodyText ? { body: bodyText, contentType } : {}),
    }),
  );
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
