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

/**
 * The staff session is dead on the backend (refresh failed / reuse detected)
 * but this tab still has the old shell mounted with nothing to re-render it —
 * only a fresh page load re-runs the server-side staff gate. Derive the login
 * URL from the *current* URL rather than an env constant: `ADMIN_BASE_PATH` is
 * meant to be rotatable per environment, and a non-`NEXT_PUBLIC_` value isn't
 * reliably inlined into the client bundle, so reading it back out of the
 * address bar (which the user is already looking at) is the robust source.
 * `/en/<basePath>/...` → redirect to `/en/<basePath>/login?next=<here>`.
 */
function redirectToLogin(): void {
  const { pathname, search } = window.location;
  const [, locale, basePath] = pathname.split('/');
  if (!locale || !basePath) return;
  const root = `/${locale}/${basePath}`;
  if (pathname.startsWith(`${root}/login`)) return; // already there — avoid a loop
  const next = encodeURIComponent(pathname + search);
  window.location.assign(`${root}/login?next=${next}`);
}

export async function adminApi<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = {
    method,
    headers: {},
    // admin data is mutable and re-fetched right after every mutation — the
    // browser must not serve a stale GET from its HTTP cache.
    cache: 'no-store',
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
    // the backend session is gone (not just this one call failing) — the shell
    // is still showing as signed in with nothing left to fetch, so send the
    // user to sign in again instead of leaving a dead page up.
    if (code === 'UNAUTHENTICATED') redirectToLogin();
    throw new AdminApiError(code, res.status);
  }
  return (payload as { data: T }).data;
}
