import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFindById } from './use-find-by-id';

interface Row {
  id: string;
}

describe('useFindById', () => {
  it('returns the match immediately when it is already in the first page — never calls loadMore', () => {
    const loadMore = vi.fn();
    const { result } = renderHook(() =>
      useFindById<Row>('b', [{ id: 'a' }, { id: 'b' }], true, false, loadMore),
    );

    expect(result.current).toEqual({ id: 'b' });
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('calls loadMore while the target is missing and hasMore is true, and returns it once a later page has it', () => {
    const loadMore = vi.fn();
    const { result, rerender } = renderHook(
      ({ items, hasMore }: { items: Row[]; hasMore: boolean }) =>
        useFindById<Row>('c', items, hasMore, false, loadMore),
      { initialProps: { items: [{ id: 'a' }], hasMore: true } },
    );

    expect(result.current).toBeNull();
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], hasMore: true });
    expect(result.current).toEqual({ id: 'c' });
    // found — no further loadMore once it's located
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('does nothing when targetId is null', () => {
    const loadMore = vi.fn();
    const { result } = renderHook(() =>
      useFindById<Row>(null, [{ id: 'a' }], true, false, loadMore),
    );

    expect(result.current).toBeNull();
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('stops calling loadMore once hasMore is false, without ever finding a stale/invalid id', () => {
    const loadMore = vi.fn();
    const { result, rerender } = renderHook(
      ({ hasMore }: { hasMore: boolean }) =>
        useFindById<Row>('missing', [{ id: 'a' }], hasMore, false, loadMore),
      { initialProps: { hasMore: true } },
    );
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender({ hasMore: false });
    rerender({ hasMore: false });
    expect(result.current).toBeNull();
    // still just the one call from while hasMore was true
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call loadMore again while a page is already loading', () => {
    const loadMore = vi.fn();
    const { rerender } = renderHook(
      ({ loadingMore }: { loadingMore: boolean }) =>
        useFindById<Row>('missing', [{ id: 'a' }], true, loadingMore, loadMore),
      { initialProps: { loadingMore: false } },
    );
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender({ loadingMore: true });
    rerender({ loadingMore: true });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call loadMore while the first page itself is still loading (isBusy covers that, not just a later page)', () => {
    // Regression: `useScrollLoad` already fetches the first page on mount
    // by itself — if this hook doesn't also wait out *that* fetch, it
    // calls `loadMore()` before it resolves, and both calls go out with
    // the same not-yet-set cursor, duplicating/racing the real first load.
    const loadMore = vi.fn();
    const { rerender } = renderHook(
      ({ isBusy, items }: { isBusy: boolean; items: Row[] }) =>
        useFindById<Row>('c', items, true, isBusy, loadMore),
      { initialProps: { isBusy: true, items: [] as Row[] } },
    );
    expect(loadMore).not.toHaveBeenCalled();

    // first page resolves, still doesn't have the target
    rerender({ isBusy: false, items: [{ id: 'a' }] });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('is bounded — gives up after a fixed number of attempts rather than loading forever', () => {
    const loadMore = vi.fn();
    const { rerender } = renderHook(
      ({ items }: { items: Row[] }) =>
        useFindById<Row>('never-there', items, true, false, loadMore),
      { initialProps: { items: [{ id: 'seed-0' }] } },
    );

    // grow the (still non-matching) list many times — far past any
    // reasonable bound
    for (let i = 1; i <= 60; i++) {
      rerender({ items: Array.from({ length: i + 1 }, (_, j) => ({ id: `seed-${j}` })) });
    }

    expect(loadMore.mock.calls.length).toBeLessThan(60);
    expect(loadMore.mock.calls.length).toBeGreaterThan(0);
  });

  describe('onExhausted — falling back to a second view (e.g. Brand/Option Types Live→Archived)', () => {
    it('fires exactly once when hasMore goes false without a match', () => {
      const loadMore = vi.fn();
      const onExhausted = vi.fn();
      const { rerender } = renderHook(
        ({ hasMore }: { hasMore: boolean }) =>
          useFindById<Row>('missing', [{ id: 'a' }], hasMore, false, loadMore, onExhausted),
        { initialProps: { hasMore: true } },
      );
      expect(onExhausted).not.toHaveBeenCalled();

      rerender({ hasMore: false });
      rerender({ hasMore: false });
      rerender({ hasMore: false });
      expect(onExhausted).toHaveBeenCalledTimes(1);
    });

    it("does not fire while items/hasMore describe the caller's fallback view too, once the target turns up there", () => {
      // simulates the caller's `onExhausted` flipping a `tab` state: Live
      // exhausts (fires once), the list then starts feeding this hook the
      // Archived view instead (hasMore resets true, new items), where the
      // target is found — `onExhausted` must not fire a second time just
      // because Archived also lacks it *before* that later page arrives.
      const loadMore = vi.fn();
      const onExhausted = vi.fn();
      const { result, rerender } = renderHook(
        ({ items, hasMore }: { items: Row[]; hasMore: boolean }) =>
          useFindById<Row>('z', items, hasMore, false, loadMore, onExhausted),
        { initialProps: { items: [{ id: 'a' }], hasMore: true } },
      );

      // Live exhausts without a match
      rerender({ items: [{ id: 'a' }], hasMore: false });
      expect(onExhausted).toHaveBeenCalledTimes(1);

      // caller flips to Archived: fresh fetch, hasMore true again
      rerender({ items: [{ id: 'a' }], hasMore: true });
      // Archived's first page has the target
      rerender({ items: [{ id: 'a' }, { id: 'z' }], hasMore: true });

      expect(result.current).toEqual({ id: 'z' });
      expect(onExhausted).toHaveBeenCalledTimes(1);
    });

    it("never fires a second time even if the fallback view also exhausts — a target nowhere doesn't bounce forever", () => {
      const loadMore = vi.fn();
      const onExhausted = vi.fn();
      const { rerender } = renderHook(
        ({ hasMore }: { hasMore: boolean }) =>
          useFindById<Row>('nowhere', [{ id: 'a' }], hasMore, false, loadMore, onExhausted),
        { initialProps: { hasMore: true } },
      );

      rerender({ hasMore: false }); // Live exhausts
      expect(onExhausted).toHaveBeenCalledTimes(1);

      rerender({ hasMore: true }); // caller flipped to Archived
      rerender({ hasMore: false }); // Archived exhausts too
      rerender({ hasMore: false });
      expect(onExhausted).toHaveBeenCalledTimes(1);
    });

    it('does not fire when there is no targetId to look for', () => {
      const loadMore = vi.fn();
      const onExhausted = vi.fn();
      renderHook(() => useFindById<Row>(null, [{ id: 'a' }], false, false, loadMore, onExhausted));
      expect(onExhausted).not.toHaveBeenCalled();
    });
  });
});
