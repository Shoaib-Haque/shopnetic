import 'server-only';
import { serverEnv } from '@/config/server-env';

const SELLER_BASE = `${serverEnv.API_BASE_URL}/seller/v1`;

export interface SellerApiResult {
  status: number;
  body: unknown;
}

interface CallOptions {
  method: string;
  accessToken: string;
  body?: string;
  contentType?: string | null;
}

/** Server-only call to a protected `/seller/v1/*` endpoint with a Bearer token. */
export async function callSellerApi(
  pathAndQuery: string,
  opts: CallOptions,
): Promise<SellerApiResult> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${opts.accessToken}`,
  };
  if (opts.body !== undefined && opts.contentType) {
    headers['content-type'] = opts.contentType;
  }

  const init: RequestInit = { method: opts.method, headers, cache: 'no-store' };
  if (opts.body !== undefined) init.body = opts.body;

  let res: Response;
  try {
    res = await fetch(`${SELLER_BASE}${pathAndQuery}`, init);
  } catch {
    return { status: 502, body: { error: { code: 'INTERNAL' } } };
  }

  const text = await res.text();
  return { status: res.status, body: text ? safeJson(text) : null };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
