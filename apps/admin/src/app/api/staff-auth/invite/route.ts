import { NextResponse } from 'next/server';
import { staffInviteCreateRequestSchema } from '@shopnetic/contracts';
import { callIdentityStaffApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';

/**
 * Unlike the other `/api/staff-auth/*` routes (login, accept-invite, …) this
 * one needs the *caller's own* staff session, not a refresh-token cookie — it
 * calls the `staff:manage`-gated `identity/v1/staff/invites`, so it goes
 * through the same Bearer dance as the `/api/admin/*` proxy.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const parsed = staffInviteCreateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  return proxyWithBearer((token) =>
    callIdentityStaffApi('/invites', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(parsed.data),
      contentType: 'application/json',
    }),
  );
}
