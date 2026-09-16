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
});
