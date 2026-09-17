'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Syncs a set of named values to the URL query string as one param per key —
 * `router.replace` (not `push`, since refining a filter/search isn't a new
 * place to visit, it's adjusting the one you're on), and a falsy value
 * (`''`, `false`, `undefined`, `null`) omits that key entirely rather than
 * writing it as empty. A value that's a page's *default* (e.g. `status=
 * 'active'`, `domain='all'`) isn't falsy on its own, so the caller passes
 * `value !== defaultValue ? value : undefined` for those — every other
 * plain string param (a search query, an unset-by-default filter already
 * represented as `''`) can be passed as-is.
 *
 * Shared by every page with its own filter/search-synced-to-URL effect
 * (Category List, Staff List, Audit Log) — same shape, previously
 * hand-rolled once per page.
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
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    // `values` (the same data as `params`, flattened to a stable-length
    // array of primitives) drives this instead of `params` itself, which is
    // a fresh object literal every render and would never be dep-equal to
    // its previous value.
  }, [pathname, router, ...values]);
}
