import 'server-only';
import { serverEnv } from '@/config/server-env';
import { parseRefreshSetCookie } from './parse-set-cookie';
import { readTokens } from './tokens';

const BASE = `${serverEnv.API_BASE_URL}/identity/v1/auth`;

interface HeaderReader {
  get(name: string): string | null;
}

export interface AuthApiResult {
  status: number;
  body: unknown;
  refreshToken?: string;
  clearedRefresh: boolean;
}

interface CallOptions {
  method: 'GET' | 'POST';
  json?: unknown;
  refreshToken?: string;
  forwardHeaders?: HeaderReader;
}

export async function callAuthApi(path: string, opts: CallOptions): Promise<AuthApiResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  if (opts.refreshToken) headers['cookie'] = `sn_rt=${opts.refreshToken}`;

  const fwd = opts.forwardHeaders;
  const ua = fwd?.get('user-agent');
  if (ua) headers['user-agent'] = ua;
  const ip = fwd?.get('x-forwarded-for') ?? fwd?.get('x-real-ip');
  if (ip) headers['x-forwarded-for'] = ip;

  const init: RequestInit = { method: opts.method, headers, cache: 'no-store' };
  if (opts.json !== undefined) init.body = JSON.stringify(opts.json);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    return { status: 502, body: { error: { code: 'INTERNAL' } }, clearedRefresh: false };
  }

  const text = await res.text();
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const parsed = parseRefreshSetCookie(setCookies);

  return {
    status: res.status,
    body: text ? safeJsonParse(text) : null,
    ...(parsed.value !== undefined ? { refreshToken: parsed.value } : {}),
    clearedRefresh: parsed.cleared,
  };
}

export interface RefreshedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export async function refreshSellerTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/token/refresh`, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `sn_rt=${refreshToken}` },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;

  const text = await res.text();
  const tokens = readTokens(safeJsonParse(text));
  if (!tokens) return null;
  const rotated = parseRefreshSetCookie(res.headers.getSetCookie?.() ?? []);
  return {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    ...(rotated.value !== undefined ? { refreshToken: rotated.value } : {}),
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
