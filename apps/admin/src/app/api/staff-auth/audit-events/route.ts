import type { NextResponse } from 'next/server';
import { callIdentityApi } from '@/features/admin-api/bridge';
import { proxyWithBearer } from '@/features/admin-api/proxy-with-bearer';

/**
 * BFF proxy for `GET identity/v1/audit-events` — `auditlog:read`, not
 * `staff:manage`, so this is its own route rather than folded into the
 * `staff/[[...path]]` catch-all. Query string (cursor/limit) passes through
 * as-is; same Bearer-attach and refresh-on-401 dance via `proxyWithBearer`.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const search = new URL(req.url).search;

  return proxyWithBearer((token) =>
    callIdentityApi(`/audit-events${search}`, { method: 'GET', accessToken: token }),
  );
}
