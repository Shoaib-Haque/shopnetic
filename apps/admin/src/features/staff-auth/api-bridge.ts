import 'server-only';
import { serverEnv } from '@/config/server-env';
import { parseStaffSetCookie } from './parse-set-cookie';

export { parseStaffSetCookie };

const BASE = `${serverEnv.API_BASE_URL}/identity/v1/staff`;

interface HeaderReader {
  get(name: string): string | null;
}

export interface StaffApiResult {
  status: number;
  body: unknown;
  /** Raw `sn_srt` value the identity API just issued, if any. */
  refreshToken?: string;
  clearedRefresh: boolean;
}

interface CallOptions {
  method: 'GET' | 'POST';
  json?: unknown;
  refreshToken?: string;
  forwardHeaders?: HeaderReader;
}

/** Server-only bridge from the admin BFF to the identity staff API. */
export async function callStaffApi(path: string, opts: CallOptions): Promise<StaffApiResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  if (opts.refreshToken) headers['cookie'] = `sn_srt=${opts.refreshToken}`;

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
  const parsed = parseStaffSetCookie(res.headers.getSetCookie?.() ?? []);

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
