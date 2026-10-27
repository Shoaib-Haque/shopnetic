import type { NextResponse } from 'next/server';
import { callSellerApi } from '@/features/seller-api/bridge';
import { proxyWithBearer } from '@/features/seller-api/proxy-with-bearer';

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
    callSellerApi(target, {
      method,
      accessToken: token,
      ...(bodyText ? { body: bodyText, contentType } : {}),
    }),
  );
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
