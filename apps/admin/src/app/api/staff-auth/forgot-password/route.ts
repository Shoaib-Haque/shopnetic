import { NextResponse } from 'next/server';
import { staffForgotPasswordRequestSchema } from '@shopnetic/contracts';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { parseJsonBody } from '@/lib/api-route';

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffForgotPasswordRequestSchema);
  if ('error' in body) return body.error;

  const result = await callStaffApi('/auth/forgot-password', {
    method: 'POST',
    json: body.data,
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}
