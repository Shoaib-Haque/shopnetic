import { NextResponse } from 'next/server';
import { staffTotpConfirmRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { setSessionCookie } from '@/features/staff-auth/session-cookie';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = staffTotpConfirmRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callStaffApi('/auth/totp/confirm', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });

  if (result.status === 200 && result.refreshToken) {
    const data = (result.body as { data?: { user?: unknown; recoveryCodes?: unknown } } | null)
      ?.data;
    const res = NextResponse.json(
      { data: { user: data?.user ?? null, recoveryCodes: data?.recoveryCodes ?? [] } },
      { status: 200 },
    );
    setSessionCookie(res, result.refreshToken);
    return res;
  }
  return NextResponse.json(result.body, { status: result.status });
}
