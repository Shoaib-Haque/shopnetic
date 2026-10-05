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
 * *which tab* a page-walk started on, not the walk itself).
 *
 * Returns the fetched record and nothing else — rendering it is entirely
 * the caller's job. Every caller shows it pinned as the first row of its
 * list, tinted rather than spliced into `items` or sorted into a "true"
 * position: prepend the returned record, and filter that same id out of
 * `items`' own normal rendering so it never appears twice (told directly,
 * 2026-09-29, not to make this a separate section — just the top row of
 * the same list, consistently, whether or not the target happened to
 * already be loaded).
 *
 * `tab`/`setTab`/`isArchived` are optional as a group, for a caller whose
 * list doesn't have a two-tab Live/Archived shape to correct in the first
 * place: a two-tab list (Brand, Option Types) reads the fetched record's
 * own lifecycle to correct `tab` before it's considered "on the right
 * tab" at all, instead of guessing from the audit event's action name.
 * Omit all three for a list with a single combined view and nothing to
 * flip (Category's flat/all — its own deep link already always opens
 * `status=all` — and Staff, which has no archived tab at all).
 *
 * Splicing the fetched record directly into `items` (the original design,
 * 2026-09-28/29) had two real problems a purely-additive pinned row avoids:
 * a list with a working `compare` could drift out of true order once more
 * pages loaded past the spliced-in row (each `loadMore()` page is appended
 * raw, never re-sorted against an earlier manual insert), and — worse —
 * once normal pagination organically reached the target's real page, its
 * id would appear a second time (nothing deduped the manual splice against
 * the naturally-loaded copy). Pinning it at top and filtering the id out of
 * `items`' own rendering sidesteps both, and also Category's own unsolvable
 * case for free — its flat/all view has no field a fetched row carries that
 * reproduces its true (server-computed, recursive) order, so there was
 * never a correct position to splice into or sort by to begin with.
 *
 * Returns `[value, setValue]`, `useState`-shaped, not just `value` — the
 * pinned row is its own state, entirely separate from the caller's own
 * `items`/`accounts`, so a local patch after a save (`items.map(x => x.id
 * === saved.id ? saved : x)`, the pattern every caller already uses to
 * avoid a full resync) never reaches it on its own. A caller whose save
 * handler already patches its list this way should also call `setValue`
 * there whenever the saved record's id matches the currently pinned one —
 * otherwise editing the very row a deep link landed on shows the save
 * succeed but leaves the pinned copy silently stale (found 2026-09-29).
 */
export function useHighlightTarget<T extends { id: string }>(opts: {
  targetId: string | null;
  fetchById: (id: string) => Promise<T>;
  tab?: 'live' | 'archived';
  setTab?: (tab: 'live' | 'archived') => void;
  isArchived?: (item: T) => boolean;
}): [T | null, (item: T) => void] {
  const { targetId, fetchById, tab, setTab, isArchived } = opts;
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
    if (!fetched || !usesTabs) return;
    const wantTab = isArchived(fetched) ? 'archived' : 'live';
    if (tab !== wantTab) setTab(wantTab);
  }, [fetched, usesTabs, tab, setTab, isArchived]);

  if (!fetched) return [null, setFetched];
  const onRightTab = !usesTabs || tab === (isArchived(fetched) ? 'archived' : 'live');
  return [onRightTab ? fetched : null, setFetched];
}
