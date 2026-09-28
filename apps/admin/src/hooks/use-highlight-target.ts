'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Finds a deep-link target (e.g. from an Audit Log row's Target) by
 * fetching it directly by id — not by paging through a cursor list
 * looking for it (`useFindById`'s own approach, still used by Category/
 * Staff). A direct fetch is one constant-time lookup regardless of list
 * size or which page the target would naturally fall on — page-walking a
 * list to "discover" something whose id you already have was real,
 * user-visible latency once a catalog grew past a couple of pages (the
 * 2026-09-28 fix, second pass — the first pass only sped up *which tab* a
 * page-walk started on, not the walk itself).
 *
 * The fetched record carries its own `archived` flag, so this also
 * replaces having to guess which tab to open on from the audit event's
 * action name — `tab` is corrected to match the record's real lifecycle
 * as soon as it's known, not guessed in advance.
 *
 * Once found, splices the record into the caller's already-loaded `items`
 * (deduped by id, inserted at its sorted position via `compare`, not just
 * appended) and flips `tab` if it doesn't match the record's own
 * lifecycle. Both are self-healing: a later real page load that doesn't
 * happen to include the target re-triggers the splice (the effect watches
 * `items`), and a tab flip settles at most once (it only fires while
 * `tab` doesn't yet match).
 *
 * Returns the record only once it's genuinely present in `items` on the
 * correct tab — not the instant the fetch resolves — so a caller's own
 * "now flash/scroll to it" effect (keyed off this becoming non-null)
 * never fires before the row actually exists in the DOM to scroll to.
 */
export function useHighlightTarget<T extends { id: string; archived: boolean }>(opts: {
  targetId: string | null;
  fetchById: (id: string) => Promise<T>;
  items: T[];
  setItems: (updater: T[] | ((prev: T[]) => T[])) => void;
  tab: 'live' | 'archived';
  setTab: (tab: 'live' | 'archived') => void;
  /** Matches the list's own real sort order (e.g. `code` ascending for
   * Option Types, `id` descending for Brand) — the spliced-in row is only
   * ever in its *correct final* position once normal pagination has
   * loaded everything before it; until then it just sits at the end of
   * whatever's currently loaded. */
  compare: (a: T, b: T) => number;
}): T | null {
  const { targetId, fetchById, items, setItems, tab, setTab, compare } = opts;
  const [fetched, setFetched] = useState<T | null>(null);
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!targetId || requestedFor.current === targetId) return;
    requestedFor.current = targetId;
    let cancelled = false;
    fetchById(targetId)
      .then((item) => {
        if (!cancelled) setFetched(item);
      })
      .catch(() => {
        // stale/invalid id, or a genuine network hiccup — same calm
        // give-up as `useFindById`'s own bounded-attempts case; no error
        // surfaced for a background deep-link lookup.
      });
    return () => {
      cancelled = true;
      // StrictMode-safe: dev double-invokes this effect (mount → cleanup
      // → mount again) without a real unmount in between. Without this
      // reset, the second invocation's guard above sees `requestedFor`
      // already set and skips re-fetching, while this cleanup has just
      // discarded the first invocation's own in-flight result via
      // `cancelled` — so the fetch fires once (visible in the network
      // tab) but its result is silently dropped and never retried (found
      // 2026-09-28, reported as a deep-link's target never appearing).
      requestedFor.current = null;
    };
  }, [targetId, fetchById]);

  useEffect(() => {
    if (!fetched) return;
    const wantTab = fetched.archived ? 'archived' : 'live';
    if (tab !== wantTab) {
      setTab(wantTab);
      return; // splice once the tab (and its own fetch) has settled
    }
    if (items.some((x) => x.id === fetched.id)) return;
    setItems((prev) => [...prev, fetched].sort(compare));
  }, [fetched, tab, items, setTab, setItems, compare]);

  if (!fetched) return null;
  const onRightTab = tab === (fetched.archived ? 'archived' : 'live');
  const spliced = items.some((x) => x.id === fetched.id);
  return onRightTab && spliced ? fetched : null;
}
