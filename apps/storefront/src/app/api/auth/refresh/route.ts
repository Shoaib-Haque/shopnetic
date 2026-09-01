import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callAuthApi } from '@/features/auth/api-bridge';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  setSessionCookie,
} from '@/features/auth/session-cookie';

export async function POST(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: { code: 'REFRESH_TOKEN_INVALID' } }, { status: 401 });
  }

  const result = await callAuthApi('/token/refresh', { method: 'POST', refreshToken: token });

  const res = NextResponse.json(result.status === 200 ? { data: { ok: true } } : result.body, {
    status: result.status,
  });
  if (result.status === 200 && result.refreshToken) setSessionCookie(res, result.refreshToken);
  else clearSessionCookie(res);
  return res;
}
