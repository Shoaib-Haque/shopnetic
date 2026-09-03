import { NextResponse } from 'next/server';
import { staffLoginRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { setSessionCookie } from '@/features/staff-auth/session-cookie';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = staffLoginRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callStaffApi('/auth/login', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });

  // Success path: tokens + Set-Cookie. Everything else (enrolment challenge,
  // MFA_REQUIRED, wrong creds) passes straight through.
  if (result.status === 200 && result.refreshToken) {
    const user = (result.body as { data?: { user?: unknown } } | null)?.data?.user ?? null;
    const res = NextResponse.json({ data: { user } }, { status: 200 });
    setSessionCookie(res, result.refreshToken);
    return res;
  }
  return NextResponse.json(result.body, { status: result.status });
}
