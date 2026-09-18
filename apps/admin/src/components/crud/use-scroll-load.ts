'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScrollLoadPage<T> {
  items: T[];
  /** `undefined` once there's nothing left to load. */
  nextCursor: string | undefined;
}

export interface UseScrollLoadResult<T> {
  items: T[];
  /** For an optimistic local mutation (role change, status flip, …) without
   * re-fetching the whole list. */
  setItems: (updater: T[] | ((prev: T[]) => T[])) => void;
  /** True only for the very first page. */
  loading: boolean;
  /** True for every page after the first. */
  loadingMore: boolean;
  /** A page failed — the *first* one if `items` is still empty, a *later*
   * one otherwise. Caller decides how to render each case: an empty-state
   * error view for the former, a small "couldn't load more" + retry near
   * the bottom for the latter — the rows already on screen must not
   * disappear just because a later page failed. */
  loadError: boolean;
  hasMore: boolean;
  /** Render as the last element of the list (e.g. `<div ref={sentinelRef} />`
   * right after the last row) — an empty `<tbody>` row for a table. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Re-run from scratch — for a "Try again" button after `loadError` with
   * no items loaded yet. */
  retry: () => void;
  /** Re-fetch the first page in the background and swap it in on success —
   * for a post-mutation resync on a list that's *always* the flat/paginated
   * view (no separate unpaginated data source with its own background-safe
   * loader to fall back on, the way a tree view has). Unlike `retry`, never
   * clears `items` or flips `loading`/`loadError` — a background refresh
   * failing shouldn't blank rows the user can already see; the mutation
   * that triggered it already surfaced its own success/error. */
  refresh: () => void;
  /** Explicitly (re)request the next page — for a "Try again" affordance
   * after `loadError` when items are already loaded (a failed *later*
   * page): the sentinel's `IntersectionObserver` only fires on a real
   * visibility change, not on every render, so a failed fetch needs an
   * explicit way to retry rather than relying on it firing again on its own. */
  loadMore: () => void;
}

/**
 * Cursor-paginated "load on scroll" for admin lists that outgrow loading
 * everything in one shot (components/crud/README.md). First page loads on
 * mount. A sentinel element (last child of the rendered list) is watched
 * with an `IntersectionObserver`: while it sits inside the visible,
 * scroll-clipped area it keeps requesting the next page — which is true
 * immediately, before any real scroll, whenever the first page doesn't
 * already fill the viewport, so a short first page keeps auto-loading
 * until the list actually needs to scroll. No separate "does this fill the
 * viewport" check is needed for that — an already-visible sentinel firing
 * on mount gives it for free. Once the list is tall enough that the
 * sentinel sits below the fold, the same observer fires again only once
 * the user actually scrolls it into view.
 */
export function useScrollLoad<T>(
  fetchPage: (cursor: string | undefined) => Promise<ScrollLoadPage<T>>,
  /** When any value here changes (a status tab, a debounced search query, …)
   * the list resets and reloads from scratch — the same idea as a
   * TanStack-Query-style query key. Omit for a fetcher that never changes
   * what it's asking for; `fetchPage` itself is read from a ref and doesn't
   * need to be listed. */
  resetKeys: readonly unknown[] = [],
  /** False when this list isn't the one currently being shown (e.g. a
   * component that switches between an unpaginated tree and this paginated
   * flat view depending on some other state) — skips the fetch entirely
   * instead of loading data nobody's about to see. Flipping it back to
   * `true` loads the first page, same as a fresh mount. Default `true`
   * matches every caller that only ever has one thing to load. */
  enabled = true,
): UseScrollLoadResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  // A monotonic id shared by the reset effect below, `refresh()`, and
  // `loadMore()` — bumped every time any of them starts a request that
  // replaces or appends to `items`. Each request's own callback checks it's
  // still the *latest* one before touching state, so an older response
  // landing after a newer one already did can't clobber it — e.g. `refresh()`
  // firing on a stale (pre-clear) search query, then the debounce settling
  // and the reset effect firing its own, correct request: whichever actually
  // *finishes* first no longer wins just by finishing first (the 2026-09-18
  // fix). Subsumes the old per-effect-run `cancelled` flag below, which only
  // protected against the reset effect racing *itself* (a resetKey changing
  // again, or StrictMode's double-invoke) — not against `refresh()`/
  // `loadMore()` racing it too.
  const seqRef = useRef(0);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const seq = ++seqRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadError(false);
    fetchPageRef
      .current(cursorRef.current)
      .then((page) => {
        if (seq !== seqRef.current) return;
        setItems((prev) => [...prev, ...page.items]);
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.nextCursor !== undefined;
        setHasMore(hasMoreRef.current);
      })
      .catch(() => {
        if (seq === seqRef.current) setLoadError(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, []);

  // (Re)start from scratch on mount, and whenever retry() bumps `attempt`.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    cursorRef.current = undefined;
    hasMoreRef.current = true;
    setItems([]);
    setHasMore(true);
    setLoadError(false);
    setLoading(true);
    fetchPageRef
      .current(undefined)
      .then((page) => {
        if (seq !== seqRef.current) return;
        setItems(page.items);
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.nextCursor !== undefined;
        setHasMore(hasMoreRef.current);
      })
      .catch(() => {
        if (seq === seqRef.current) setLoadError(true);
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [attempt, enabled, ...resetKeys]);

  // A callback ref (not a plain useRef) — the sentinel div only exists once
  // `loading` is false, so a plain ref's effect would capture `null` forever
  // if it only ran once on mount. React invokes a callback ref every time
  // the underlying DOM node itself mounts or unmounts, so the observer
  // attaches as soon as the sentinel actually renders.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      });
      observer.observe(node);
      observerRef.current = observer;
    },
    [loadMore],
  );

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const refresh = useCallback(() => {
    const seq = ++seqRef.current;
    fetchPageRef
      .current(undefined)
      .then((page) => {
        if (seq !== seqRef.current) return;
        setItems(page.items);
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.nextCursor !== undefined;
        setHasMore(hasMoreRef.current);
      })
      .catch(() => {
        // best-effort — see the doc comment on `refresh` above
      });
  }, []);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    loadError,
    hasMore,
    sentinelRef,
    retry,
    refresh,
    loadMore,
  };
}
