import 'server-only';
import { serverEnv } from '@/config/server-env';
import { parseStaffSetCookie } from '@/features/staff-auth/parse-set-cookie';
import { readTokens } from '@/features/staff-auth/tokens';

const ADMIN_BASE = `${serverEnv.API_BASE_URL}/admin/v1`;
const REFRESH_URL = `${serverEnv.API_BASE_URL}/identity/v1/staff/auth/token/refresh`;

export interface AdminApiResult {
  status: number;
  body: unknown;
}

interface CallOptions {
  method: string;
  accessToken: string;
  body?: string;
  contentType?: string | null;
}

/** Server-only call to a protected `/admin/v1/*` endpoint with a Bearer token. */
export async function callAdminApi(
  pathAndQuery: string,
  opts: CallOptions,
): Promise<AdminApiResult> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${opts.accessToken}`,
  };
  if (opts.body !== undefined && opts.contentType) headers['content-type'] = opts.contentType;

  const init: RequestInit = { method: opts.method, headers, cache: 'no-store' };
  if (opts.body !== undefined) init.body = opts.body;

  let res: Response;
  try {
    res = await fetch(`${ADMIN_BASE}${pathAndQuery}`, init);
  } catch {
    return { status: 502, body: { error: { code: 'INTERNAL' } } };
  }
  const text = await res.text();
  return { status: res.status, body: text ? safeJson(text) : null };
}

export interface RefreshedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

/**
 * Exchange the staff refresh cookie for a fresh access token. This **rotates**
 * `sn_srt` (identity API reuse-detection), so the caller must persist the
 * returned `refreshToken`. Returns `null` when the session is no longer valid.
 */
export async function refreshStaffTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  let res: Response;
  try {
    res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `sn_srt=${refreshToken}` },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;

  const tokens = readTokens(safeJson(await res.text()));
  if (!tokens) return null;
  const rotated = parseStaffSetCookie(res.headers.getSetCookie?.() ?? []);
  return {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    ...(rotated.value !== undefined ? { refreshToken: rotated.value } : {}),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
