import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import type { SessionUser } from '@shopnetic/contracts';
import { callAuthApi } from './api-bridge';
import { SESSION_COOKIE } from './session-cookie';

/**
 * The signed-in user for the current request, or `null`. Memoised per request
 * (React `cache`). Server Components / route handlers call this — never the
 * client. Reads the session from the identity API; does not rotate tokens.
 */
export const getCurrentActor = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await callAuthApi('/session', {
    method: 'GET',
    refreshToken: token,
    forwardHeaders: await headers(),
  });
  if (result.status !== 200) return null;

  const body = result.body as { data?: { user?: SessionUser } } | null;
  return body?.data?.user ?? null;
});
