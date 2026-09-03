import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import type { SessionUser } from '@shopnetic/contracts';
import { callStaffApi } from './api-bridge';
import { SESSION_COOKIE } from './session-cookie';

/**
 * The signed-in staff user for the current request, or `null`. Memoised per
 * request. Server Components / route handlers only. Reads the staff session
 * from the identity API; does not rotate tokens.
 */
export const getCurrentStaff = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await callStaffApi('/auth/session', {
    method: 'GET',
    refreshToken: token,
    forwardHeaders: await headers(),
  });
  if (result.status !== 200) return null;

  const body = result.body as { data?: { user?: SessionUser } } | null;
  return body?.data?.user ?? null;
});
