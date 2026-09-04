import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import {
  SESSION_COOKIE,
  clearAccessCookie,
  clearSessionCookie,
} from '@/features/staff-auth/session-cookie';

export async function POST(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await callStaffApi('/auth/logout', { method: 'POST', refreshToken: token });

  const res = NextResponse.json({ data: { ok: true } });
  clearSessionCookie(res);
  clearAccessCookie(res);
  return res;
}
