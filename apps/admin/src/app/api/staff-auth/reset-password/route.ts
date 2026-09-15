import { NextResponse } from 'next/server';
import { staffResetPasswordRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = staffResetPasswordRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callStaffApi('/auth/reset-password', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });
  // a 204 must carry zero bytes — NextResponse.json(null, {status:204}) throws
  return result.status === 204
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(result.body, { status: result.status });
}
