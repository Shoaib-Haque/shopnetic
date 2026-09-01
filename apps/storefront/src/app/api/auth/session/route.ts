import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callAuthApi } from '@/features/auth/api-bridge';
import { SESSION_COOKIE } from '@/features/auth/session-cookie';

/** Current user for the client `AuthStrip`. `{ data: { user } }` or `{ data: { user: null } }`. */
export async function GET(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ data: { user: null } });

  const result = await callAuthApi('/session', { method: 'GET', refreshToken: token });
  if (result.status !== 200) return NextResponse.json({ data: { user: null } });

  const user = (result.body as { data?: { user?: unknown } } | null)?.data?.user ?? null;
  return NextResponse.json({ data: { user } });
}
