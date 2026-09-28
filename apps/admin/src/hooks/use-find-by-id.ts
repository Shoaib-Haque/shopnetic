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
 *
 * `onExhausted` fires at most once per mount, exactly when the search gives
 * up without a match (`hasMore` went false, or the attempt cap was hit) —
 * for a caller whose "list" is actually two mutually exclusive views (e.g.
 * Brand's/Option Types' Live vs. Archived tabs, unlike Category's own
 * combined `all` mode) to fall back to the other one. `items`/`hasMore`/
 * `loadMore` are expected to then start describing that other view (e.g.
 * the callback flips a `tab` state, which `useScrollLoad`'s own resetKeys
 * already react to) — this hook doesn't know or care that happened, it
 * just keeps looking at whatever it's handed. Never fires a second time
 * even if that other view also exhausts, so a target that's genuinely
 * nowhere doesn't bounce between views forever.
 */
export function useFindById<T extends { id: string }>(
  targetId: string | null,
  items: T[],
  hasMore: boolean,
  isBusy: boolean,
  loadMore: () => void,
  onExhausted?: () => void,
): T | null {
  const [found, setFound] = useState<T | null>(null);
  const attempts = useRef(0);
  const exhaustedFired = useRef(false);

  useEffect(() => {
    if (!targetId || found) return;
    const match = items.find((item) => item.id === targetId);
    if (match) {
      setFound(match);
      return;
    }
    const exhausted = !hasMore || attempts.current >= MAX_LOAD_ATTEMPTS;
    if (exhausted) {
      if (!exhaustedFired.current) {
        exhaustedFired.current = true;
        onExhausted?.();
      }
      return;
    }
    if (isBusy) return;
    attempts.current += 1;
    loadMore();
  }, [targetId, items, hasMore, isBusy, loadMore, found, onExhausted]);

  return found;
}
