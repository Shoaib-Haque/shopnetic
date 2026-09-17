import { NextResponse } from 'next/server';
import { staffTotpConfirmRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { applyAuthCookies } from '@/features/staff-auth/session-cookie';
import { parseJsonBody } from '@/lib/api-route';

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffTotpConfirmRequestSchema);
  if ('error' in body) return body.error;

  const result = await callStaffApi('/auth/totp/confirm', {
    method: 'POST',
    json: body.data,
    forwardHeaders: req.headers,
  });

  if (result.status === 200 && result.refreshToken) {
    const data = (result.body as { data?: { user?: unknown; recoveryCodes?: unknown } } | null)
      ?.data;
    const res = NextResponse.json(
      { data: { user: data?.user ?? null, recoveryCodes: data?.recoveryCodes ?? [] } },
      { status: 200 },
    );
    applyAuthCookies(res, result.refreshToken, result.body);
    return res;
  }
  return NextResponse.json(result.body, { status: result.status });
}
