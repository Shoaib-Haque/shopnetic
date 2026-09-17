import { NextResponse } from 'next/server';
import { staffResetPasswordRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { parseJsonBody } from '@/lib/api-route';

/** The reset page calls this on load to tell a dead link (used/expired/
 * unknown) apart from a live one immediately, not only once submitted. */
export async function GET(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const result = await callStaffApi(`/auth/reset-password?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffResetPasswordRequestSchema);
  if ('error' in body) return body.error;

  const result = await callStaffApi('/auth/reset-password', {
    method: 'POST',
    json: body.data,
    forwardHeaders: req.headers,
  });
  // a 204 must carry zero bytes — NextResponse.json(null, {status:204}) throws
  return result.status === 204
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(result.body, { status: result.status });
}
