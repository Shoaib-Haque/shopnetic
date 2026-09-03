import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callStaffApi } from '@/features/staff-auth/api-bridge';
import { SESSION_COOKIE } from '@/features/staff-auth/session-cookie';

/** For a client that needs the current staff user without a full page load. */
export async function GET(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ data: { user: null } });

  const result = await callStaffApi('/auth/session', { method: 'GET', refreshToken: token });
  if (result.status !== 200) return NextResponse.json({ data: { user: null } });

  const user = (result.body as { data?: { user?: unknown } } | null)?.data?.user ?? null;
  return NextResponse.json({ data: { user } });
}
