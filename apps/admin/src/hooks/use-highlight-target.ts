'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Finds a deep-link target (e.g. from an Audit Log row's Target) by
 * fetching it directly by id — not by paging through a cursor list looking
 * for it (the old `useFindById`'s approach, since removed once every list
 * using it had migrated here). A direct fetch is one constant-time lookup
 * regardless of list size or which page the target would naturally fall
 * on — page-walking a list to "discover" something whose id you already
 * have was real, user-visible latency once a catalog grew past a couple of
 * pages (the 2026-09-28 fix, second pass — the first pass only sped up
 * *which tab* a page-walk started on, not the walk itself; a third pass the
 * same day generalized this hook beyond Brand/Option Types' original
 * two-tab shape to cover Category and Staff too, the 2026-09-29 fix).
 *
 * Two things are optional, for a caller whose list doesn't have the shape
 * they assume:
 *
 * - `tab`/`setTab`/`isArchived` — a two-tab Live/Archived list (Brand,
 *   Option Types) reads the fetched record's own lifecycle to correct
 *   `tab` before splicing, instead of guessing from the audit event's
 *   action name in advance. Omit all three for a list with a single
 *   combined view and nothing to flip (Category's flat/all — its own deep
 *   link already always opens `status=all` — and Staff, which has no
 *   archived tab at all).
 * - `compare` — sorts the spliced-in record into its correct position,
 *   matching the list's own real order (e.g. `code` ascending for Option
 *   Types, `id` descending for Brand). Omit for a list whose true order
 *   can't be replicated client-side from a single fetched record (Category's
 *   flat/all view is a server-computed recursive tree rank — see
 *   `category.service.ts`'s own `list()` doc comment — not any field a
 *   fetched row carries) — the record is then just appended, out of "true"
 *   order within whatever's currently loaded, in exchange for still not
 *   needing a page-walk wait.
 *
 * Once found, splices the record into the caller's already-loaded `items`
 * (deduped by id) and flips `tab` first if given and it doesn't match the
 * record's own lifecycle. Both are self-healing: a later real page load
 * that doesn't happen to include the target re-triggers the splice (the
 * effect watches `items`), and a tab flip settles at most once (it only
 * fires while `tab` doesn't yet match).
 *
 * Returns the record only once it's genuinely present in `items` (and, if
 * tab-switching is in use, on the correct tab) — not the instant the fetch
 * resolves — so a caller's own "now flash/scroll to it" effect (keyed off
 * this becoming non-null) never fires before the row actually exists in the
 * DOM to scroll to.
 */
export function useHighlightTarget<T extends { id: string }>(opts: {
  targetId: string | null;
  fetchById: (id: string) => Promise<T>;
  items: T[];
  setItems: (updater: T[] | ((prev: T[]) => T[])) => void;
  tab?: 'live' | 'archived';
  setTab?: (tab: 'live' | 'archived') => void;
  isArchived?: (item: T) => boolean;
  compare?: (a: T, b: T) => number;
}): T | null {
  const { targetId, fetchById, items, setItems, tab, setTab, isArchived, compare } = opts;
  const [fetched, setFetched] = useState<T | null>(null);
  const requestedFor = useRef<string | null>(null);
  const usesTabs = tab !== undefined && setTab !== undefined && isArchived !== undefined;

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
    if (usesTabs) {
      const wantTab = isArchived(fetched) ? 'archived' : 'live';
      if (tab !== wantTab) {
        setTab(wantTab);
        return; // splice once the tab (and its own fetch) has settled
      }
    }
    if (items.some((x) => x.id === fetched.id)) return;
    setItems((prev) => (compare ? [...prev, fetched].sort(compare) : [...prev, fetched]));
  }, [fetched, usesTabs, tab, setTab, isArchived, items, setItems, compare]);

  if (!fetched) return null;
  const onRightTab = !usesTabs || tab === (isArchived(fetched) ? 'archived' : 'live');
  const spliced = items.some((x) => x.id === fetched.id);
  return onRightTab && spliced ? fetched : null;
}
