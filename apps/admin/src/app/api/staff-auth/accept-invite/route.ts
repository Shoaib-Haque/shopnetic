import { NextResponse } from 'next/server';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { parseJsonBody } from '@/lib/api-route';

/** The accept-invite page calls this on load to tell a dead link (already
 * accepted/expired/unknown) apart from a live one immediately, not only
 * once submitted. */
export async function GET(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const result = await callStaffApi(`/invites/accept?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffInviteAcceptRequestSchema);
  if ('error' in body) return body.error;

  const result = await callStaffApi('/invites/accept', {
    method: 'POST',
    json: body.data,
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}
