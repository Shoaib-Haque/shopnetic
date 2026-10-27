import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { callAuthApi } from '@/features/auth/api-bridge';
import { SESSION_COOKIE } from '@/features/auth/session-cookie';

export async function GET(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: { user: null } }, { status: 200 });
  }

  const result = await callAuthApi('/session', {
    method: 'GET',
    refreshToken: token,
    forwardHeaders: await headers(),
  });

  return NextResponse.json(result.body, { status: result.status });
}
