import { NextResponse } from 'next/server';
import { resendVerificationRequestSchema } from '@shopnetic/contracts';
import { callAuthApi } from '@/features/auth/api-bridge';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = resendVerificationRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callAuthApi('/verification/resend', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });
  return NextResponse.json(result.body, { status: result.status });
}
