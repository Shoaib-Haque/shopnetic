import { NextResponse } from 'next/server';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';

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
  const parsed = staffInviteAcceptRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callStaffApi('/invites/accept', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}
