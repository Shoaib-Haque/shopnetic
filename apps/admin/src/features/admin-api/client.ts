'use client';

/**
 * Client-side calls to the admin API, via the BFF proxy at `/api/admin/*`.
 * Returns the envelope's `data`; throws `AdminApiError` (with the stable `code`)
 * on failure so components can map it to a localized message.
 */
export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AdminApiError';
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function adminApi<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = {
    method,
    headers: {},
    ...(opts.signal ? { signal: opts.signal } : {}),
  };
  if (opts.body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(`/api/admin${path}`, init);
  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* empty / non-JSON */
  }

  if (!res.ok) {
    const code =
      (payload as { error?: { code?: string } } | null)?.error?.code ??
      (res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL');
    throw new AdminApiError(code, res.status);
  }
  return (payload as { data: T }).data;
}
