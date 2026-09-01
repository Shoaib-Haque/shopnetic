import { NextResponse } from 'next/server';
import { loginRequestSchema } from '@shopnetic/contracts';
import { callAuthApi } from '@/features/auth/api-bridge';
import { setSessionCookie } from '@/features/auth/session-cookie';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = loginRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callAuthApi('/login', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });

  // The access token stays server-side; the browser only gets the user + a
  // storefront-scoped refresh cookie.
  if (result.status === 200 && result.refreshToken) {
    const user = (result.body as { data?: { user?: unknown } } | null)?.data?.user ?? null;
    const res = NextResponse.json({ data: { user } }, { status: 200 });
    setSessionCookie(res, result.refreshToken);
    return res;
  }

  return NextResponse.json(result.body, { status: result.status });
}
