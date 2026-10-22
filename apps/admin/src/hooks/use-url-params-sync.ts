'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Syncs a set of named values to the URL query string as one param per key.
 *
 * Uses `window.history.replaceState` directly to keep URL sync 100% client-side.
 * Next.js `router.replace()` backs query-string updates with background RSC
 * network fetches; on degraded, flaky, or offline connections, a failed RSC
 * fetch causes Next.js to trigger a full document navigation reload, crashing
 * to Chrome's native offline error page. Direct `replaceState` avoids any
 * network round-trip while keeping the browser address bar in sync.
 */
export function useUrlParamsSync(params: Record<string, string | false | undefined | null>): void {
  const pathname = usePathname();
  const values = Object.values(params);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value);
    }
    const s = qs.toString();
    const url = s ? `${pathname}?${s}` : pathname;

    window.history.replaceState(window.history.state, '', url);
  }, [pathname, ...values]);
}
