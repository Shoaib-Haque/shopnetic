'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Syncs a set of named values to the URL query string as one param per key.
 *
 * When online, uses `router.replace(..., { scroll: false })`.
 * When offline (`!navigator.onLine`), Next.js router.replace triggers an RSC
 * fetch that fails and causes Next.js to fall back to a full window.location
 * navigation (Chrome's native offline error page). When offline, we use
 * `window.history.replaceState` directly to keep URL sync 100% client-side.
 */
export function useUrlParamsSync(params: Record<string, string | false | undefined | null>): void {
  const router = useRouter();
  const pathname = usePathname();
  const values = Object.values(params);

  useEffect(() => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value);
    }
    const s = qs.toString();
    const url = s ? `${pathname}?${s}` : pathname;

    if (typeof navigator !== 'undefined' && !navigator.onLine && typeof window !== 'undefined') {
      window.history.replaceState(null, '', url);
      return;
    }

    try {
      router.replace(url, { scroll: false });
    } catch {
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', url);
      }
    }
  }, [pathname, router, ...values]);
}
