import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callAuthApi } from '@/features/auth/api-bridge';
import { SESSION_COOKIE, clearSessionCookie } from '@/features/auth/session-cookie';

export async function POST(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await callAuthApi('/logout', { method: 'POST', refreshToken: token });

  const res = NextResponse.json({ data: { ok: true } });
  clearSessionCookie(res);
  return res;
}
