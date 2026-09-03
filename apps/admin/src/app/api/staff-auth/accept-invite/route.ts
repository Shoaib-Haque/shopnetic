import { NextResponse } from 'next/server';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';

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
