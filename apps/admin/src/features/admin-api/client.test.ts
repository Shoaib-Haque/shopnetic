import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED' } };

const realLocation = window.location;

/** jsdom's `window.location` isn't spy-able in place (`assign` is a
 * non-configurable property) — a full stub swaps in for the duration of the
 * test instead. Only `pathname`/`search`/`assign` are actually read/called by
 * `redirectToLogin`; the rest exist to satisfy the `Location` shape. */
function fakeLocation(pathname: string): Location {
  return {
    ancestorOrigins: {
      length: 0,
      contains: () => false,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as DOMStringList,
    hash: '',
    host: 'localhost',
    hostname: 'localhost',
    href: `http://localhost${pathname}`,
    origin: 'http://localhost',
    pathname,
    port: '',
    protocol: 'http:',
    search: '',
    assign: vi.fn(),
    reload: () => {},
    replace: () => {},
    toString: () => `http://localhost${pathname}`,
  } as Location;
}

beforeEach(() => {
  // `redirecting` is module-level state (by design — a real page navigation
  // never comes back) — reload the module fresh per test rather than fighting
  // it with a reset hook.
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).location;
  window.location = fakeLocation('/en/x7f2k9t3m1qp/catalog/categories');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location = realLocation;
});

describe('adminApi — deterministic post-401 redirect', () => {
  it('redirects exactly once even when two calls both come back UNAUTHENTICATED concurrently', async () => {
    const { adminApi, AdminApiError } = await import('./client');
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, UNAUTHENTICATED));

    const [r1, r2] = await Promise.allSettled([adminApi('/categories'), adminApi('/categories/x')]);

    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    expect((r1 as PromiseRejectedResult).reason).toBeInstanceOf(AdminApiError);
    expect(window.location.assign).toHaveBeenCalledTimes(1);
  });

  it('a call started after a redirect is already in flight fails fast — no second fetch, no second navigation', async () => {
    const { adminApi } = await import('./client');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, UNAUTHENTICATED));

    // reproduces the original bug shape: a mutation's own 401 triggers the
    // redirect, then its `finally { resync() }` fires a second call afterward
    // — that second call must not re-fetch or race the navigation.
    await expect(adminApi('/categories/x')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledTimes(1);

    await expect(adminApi('/categories')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1); // still 1 — the second call never fetched
    expect(window.location.assign).toHaveBeenCalledTimes(1); // still 1 — no second navigation
  });

  it('does not redirect on a 500 — only UNAUTHENTICATED triggers it', async () => {
    const { adminApi, AdminApiError } = await import('./client');
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { error: { code: 'INTERNAL' } }));

    await expect(adminApi('/categories')).rejects.toBeInstanceOf(AdminApiError);
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
