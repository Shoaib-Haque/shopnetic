import { NextResponse } from 'next/server';
import { staffLoginRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { applyAuthCookies } from '@/features/staff-auth/session-cookie';
import { parseJsonBody } from '@/lib/api-route';

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffLoginRequestSchema);
  if ('error' in body) return body.error;

  const result = await callStaffApi('/auth/login', {
    method: 'POST',
    json: body.data,
    forwardHeaders: req.headers,
  });

  // Success path: tokens + Set-Cookie. Everything else (enrolment challenge,
  // MFA_REQUIRED, wrong creds) passes straight through.
  if (result.status === 200 && result.refreshToken) {
    const user = (result.body as { data?: { user?: unknown } } | null)?.data?.user ?? null;
    const res = NextResponse.json({ data: { user } }, { status: 200 });
    applyAuthCookies(res, result.refreshToken, result.body);
    return res;
  }
  return NextResponse.json(result.body, { status: result.status });
}
