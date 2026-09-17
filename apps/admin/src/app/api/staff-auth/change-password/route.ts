import { NextResponse } from 'next/server';
import { staffChangePasswordRequestSchema } from '@shopnetic/contracts';
import { callIdentityStaffApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';
import { parseJsonBody } from '@/lib/api-route';

/**
 * Self-service, like `invite` — needs the caller's own staff session, so it
 * goes through the Bearer dance rather than a refresh-token cookie.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffChangePasswordRequestSchema);
  if ('error' in body) return body.error;

  return proxyWithBearer((token) =>
    callIdentityStaffApi('/auth/change-password', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(body.data),
      contentType: 'application/json',
    }),
  );
}
