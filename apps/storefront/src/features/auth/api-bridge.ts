import 'server-only';
import { serverEnv } from '@/config/server-env';
import { parseRefreshSetCookie } from './parse-set-cookie';

export { parseRefreshSetCookie };

const BASE = `${serverEnv.API_BASE_URL}/identity/v1/auth`;

interface HeaderReader {
  get(name: string): string | null;
}

export interface AuthApiResult {
  status: number;
  body: unknown;
  /** Raw `sn_rt` value the identity API just issued, if any. */
  refreshToken?: string;
  /** The identity API explicitly cleared the refresh cookie. */
  clearedRefresh: boolean;
}

interface CallOptions {
  method: 'GET' | 'POST';
  json?: unknown;
  /** Forwarded to the identity API as its `sn_rt` cookie. */
  refreshToken?: string;
  /** Inbound request headers, to propagate UA + client IP for rate limiting. */
  forwardHeaders?: HeaderReader;
}

/** Server-only bridge from the storefront BFF to the identity API. */
export async function callAuthApi(path: string, opts: CallOptions): Promise<AuthApiResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  if (opts.refreshToken) headers['cookie'] = `${'sn_rt'}=${opts.refreshToken}`;

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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
