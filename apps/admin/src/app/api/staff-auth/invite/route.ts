import { NextResponse } from 'next/server';
import { staffInviteCreateRequestSchema } from '@shopnetic/contracts';
import { callIdentityStaffApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';
import { parseJsonBody } from '@/lib/api-route';

/**
 * Unlike the other `/api/staff-auth/*` routes (login, accept-invite, …) this
 * one needs the *caller's own* staff session, not a refresh-token cookie — it
 * calls the `staff:manage`-gated `identity/v1/staff/invites`, so it goes
 * through the same Bearer dance as the `/api/admin/*` proxy.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseJsonBody(req, staffInviteCreateRequestSchema);
  if ('error' in body) return body.error;

  return proxyWithBearer((token) =>
    callIdentityStaffApi('/invites', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(body.data),
      contentType: 'application/json',
    }),
  );
}
