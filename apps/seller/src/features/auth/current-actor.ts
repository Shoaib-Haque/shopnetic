import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { sessionUserSchema, type SessionUser } from '@shopnetic/contracts';
import { callAuthApi } from './api-bridge';
import { SESSION_COOKIE } from './session-cookie';

const sessionEnvelopeSchema = z.object({
  data: z.object({
    user: sessionUserSchema,
  }),
});

/**
 * The signed-in user for the current request, or `null`. Memoised per request (React `cache`).
 */
export const getCurrentActor = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const head = await headers();
  const result = await callAuthApi('/session', {
    method: 'GET',
    refreshToken: token,
    forwardHeaders: head,
  });
  if (result.status !== 200) return null;

  const parsed = sessionEnvelopeSchema.safeParse(result.body);
  return parsed.success ? parsed.data.data.user : null;
});
