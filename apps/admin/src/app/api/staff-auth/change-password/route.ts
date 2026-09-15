import { NextResponse } from 'next/server';
import { staffChangePasswordRequestSchema } from '@shopnetic/contracts';
import { callIdentityStaffApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';

/**
 * Self-service, like `invite` — needs the caller's own staff session, so it
 * goes through the Bearer dance rather than a refresh-token cookie.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const parsed = staffChangePasswordRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 });
  }

  return proxyWithBearer((token) =>
    callIdentityStaffApi('/auth/change-password', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(parsed.data),
      contentType: 'application/json',
    }),
  );
}
