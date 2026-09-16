'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_LOAD_ATTEMPTS = 40;

/**
 * Progressively calls `loadMore` until `items` contains a row whose `id`
 * matches `targetId`, or there's nothing left to load — for a deep link
 * (e.g. from an Audit Log row's Target) landing on a specific row of a
 * cursor-paginated list that might not be on the first page yet. Bounded so
 * a stale/invalid id doesn't load the whole table trying to find something
 * that was never there.
 *
 * `isBusy` must cover *any* fetch already in flight — the first page's own
 * automatic mount-time load (`useScrollLoad`'s `loading`), not just a later
 * page's (`loadingMore`). Passing only `loadingMore` races that first
 * fetch: `loadMore()` fires before it resolves, both calls go out with the
 * same (still-unset) cursor, and the second overwrites/duplicates the first.
 */
export function useFindById<T extends { id: string }>(
  targetId: string | null,
  items: T[],
  hasMore: boolean,
  isBusy: boolean,
  loadMore: () => void,
): T | null {
  const [found, setFound] = useState<T | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!targetId || found) return;
    const match = items.find((item) => item.id === targetId);
    if (match) {
      setFound(match);
      return;
    }
    if (!hasMore || isBusy || attempts.current >= MAX_LOAD_ATTEMPTS) return;
    attempts.current += 1;
    loadMore();
  }, [targetId, items, hasMore, isBusy, loadMore, found]);

  return found;
}
