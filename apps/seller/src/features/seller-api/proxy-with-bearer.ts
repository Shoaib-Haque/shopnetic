import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerWithShopSchema, type SellerWithShop, type SessionUser } from '@shopnetic/contracts';
import {
  ACCESS_COOKIE,
  SESSION_COOKIE,
  clearAccessCookie,
  clearSessionCookie,
  setAccessCookie,
  setSessionCookie,
} from '@/features/auth/session-cookie';
import { refreshSellerTokens } from '@/features/auth/api-bridge';
import { getCurrentActor } from '@/features/auth/current-actor';
import { callSellerApi, type SellerApiResult } from './bridge';

const sellerWithShopEnvelopeSchema = z.object({
  data: sellerWithShopSchema,
});

export async function proxyWithBearer(
  call: (accessToken: string) => Promise<SellerApiResult>,
): Promise<NextResponse> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(SESSION_COOKIE)?.value;
  if (!access && !refresh) return unauthorized();

  let result: SellerApiResult | undefined;
  if (access) result = await call(access);

  let refreshedAccess: { token: string; expiresIn: number } | undefined;
  let rotatedRefresh: string | undefined;
  if ((!result || result.status === 401) && refresh) {
    const refreshed = await refreshSellerTokens(refresh);
    if (!refreshed) return unauthorized(true);
    refreshedAccess = { token: refreshed.accessToken, expiresIn: refreshed.expiresIn };
    rotatedRefresh = refreshed.refreshToken;
    result = await call(refreshed.accessToken);
  }
  if (!result) return unauthorized();

  const res =
    result.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(result.body ?? null, { status: result.status });

  if (refreshedAccess) setAccessCookie(res, refreshedAccess.token, refreshedAccess.expiresIn);
  if (rotatedRefresh) setSessionCookie(res, rotatedRefresh);
  if (result.status === 401) clearAccessCookie(res);
  return res;
}

function unauthorized(clearAll = false): NextResponse {
  const res = NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (clearAll) {
    clearAccessCookie(res);
    clearSessionCookie(res);
  }
  return res;
}

export interface SellerSessionInfo {
  actor: SessionUser | null;
  seller: SellerWithShop | null;
}

/**
 * Server-only helper to inspect current user and seller profile in React Server Components.
 */
export async function getSellerSession(): Promise<SellerSessionInfo> {
  const actor = await getCurrentActor();
  if (!actor) return { actor: null, seller: null };

  const jar = await cookies();
  let access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(SESSION_COOKIE)?.value;

  if (!access && refresh) {
    const refreshed = await refreshSellerTokens(refresh);
    if (refreshed) access = refreshed.accessToken;
  }
  if (!access) return { actor, seller: null };

  let res = await callSellerApi('/me', { method: 'GET', accessToken: access });
  if (res.status === 401 && refresh) {
    const refreshed = await refreshSellerTokens(refresh);
    if (refreshed) {
      access = refreshed.accessToken;
      res = await callSellerApi('/me', { method: 'GET', accessToken: access });
    }
  }

  if (res.status === 200 && res.body) {
    const parsed = sellerWithShopEnvelopeSchema.safeParse(res.body);
    return { actor, seller: parsed.success ? parsed.data.data : null };
  }

  return { actor, seller: null };
}
