import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loginRequestSchema, sessionUserSchema } from '@shopnetic/contracts';
import { callAuthApi } from '@/features/auth/api-bridge';
import { applyAuthCookies } from '@/features/auth/session-cookie';

const loginSuccessEnvelopeSchema = z.object({
  data: z.object({
    user: sessionUserSchema,
  }),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = loginRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  const result = await callAuthApi('/login', {
    method: 'POST',
    json: parsed.data,
    forwardHeaders: req.headers,
  });

  if (result.status === 200 && result.refreshToken) {
    const envelope = loginSuccessEnvelopeSchema.safeParse(result.body);
    const user = envelope.success ? envelope.data.data.user : null;
    const res = NextResponse.json({ data: { user } }, { status: 200 });
    applyAuthCookies(res, result.refreshToken, result.body);
    return res;
  }

  return NextResponse.json(result.body, { status: result.status });
}
