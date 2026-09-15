import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { triggerIntersection } from '@/test/intersection-observer';
import { useScrollLoad, type ScrollLoadPage } from './use-scroll-load';

function page(items: number[], nextCursor: string | undefined): ScrollLoadPage<number> {
  return { items, nextCursor };
}

/** Attaches the hook's sentinel to a detached element and returns it, so a
 * test can call `triggerIntersection(el)` without a real component tree. */
function mountSentinel(sentinelRef: (node: HTMLElement | null) => void): HTMLElement {
  const el = document.createElement('div');
  act(() => sentinelRef(el));
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScrollLoad', () => {
  it('loads the first page on mount with an undefined cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2, 3], undefined));
    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('a sentinel already visible on mount (first page didn’t fill the viewport) keeps auto-loading until hasMore is false', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1], 'c1'))
      .mockResolvedValueOnce(page([2], 'c2'))
      .mockResolvedValueOnce(page([3], undefined));

    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const sentinel = mountSentinel(result.current.sentinelRef);
    act(() => triggerIntersection(sentinel));
    await waitFor(() => expect(result.current.items).toEqual([1, 2]));

    // still visible (nothing to scroll) — fires again on its own
    act(() => triggerIntersection(sentinel));
    await waitFor(() => expect(result.current.items).toEqual([1, 2, 3]));
    expect(result.current.hasMore).toBe(false);

    // no more pages once hasMore is false, even if triggered again
    act(() => triggerIntersection(sentinel));
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('ignores a second trigger while a page is already loading (no duplicate fetch)', async () => {
    let resolveSecond!: (p: ScrollLoadPage<number>) => void;
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1], 'c1'))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));

    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const sentinel = mountSentinel(result.current.sentinelRef);
    act(() => triggerIntersection(sentinel));
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    act(() => triggerIntersection(sentinel)); // still loading — must be a no-op
    expect(fetchPage).toHaveBeenCalledTimes(2);

    await act(async () => resolveSecond(page([2], undefined)));
    expect(result.current.items).toEqual([1, 2]);
  });

  it('a failed page sets loadError; retry() reloads from scratch', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([9], undefined));

    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.items).toEqual([]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe(false);
    expect(result.current.items).toEqual([9]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('a failed *later* page keeps the already-loaded rows on screen; loadMore() retries and clears the error', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 'c1'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([3], undefined));

    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    // the rows from the successful first page must not disappear
    expect(result.current.items).toEqual([1, 2]);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual([1, 2, 3]));
    expect(result.current.loadError).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('setItems lets a caller apply an optimistic local mutation without re-fetching', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2], undefined));
    const { result } = renderHook(() => useScrollLoad<number>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setItems((prev) => prev.map((n) => n * 10)));
    expect(result.current.items).toEqual([10, 20]);
    expect(fetchPage).toHaveBeenCalledTimes(1); // no extra fetch triggered
  });

  it('resetKeys changing (a status tab, a search query, …) reloads from scratch', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], undefined))
      .mockResolvedValueOnce(page([9], undefined));

    let key = 'active';
    const { result, rerender } = renderHook(() => useScrollLoad<number>(fetchPage, [key]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([1, 2]);

    key = 'archived';
    rerender();
    // reloads from an undefined cursor, not appending onto the old page
    await waitFor(() => expect(result.current.items).toEqual([9]));
    expect(fetchPage).toHaveBeenNthCalledWith(2, undefined);
  });

  it('enabled=false never fetches — for a list that isn’t the one currently shown; flipping it true loads the first page', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2], undefined));
    let on = false;
    const { result, rerender } = renderHook(() => useScrollLoad<number>(fetchPage, [], on));

    expect(result.current.loading).toBe(false); // not stuck "loading" while disabled
    expect(result.current.items).toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();

    on = true;
    rerender();
    await waitFor(() => expect(result.current.items).toEqual([1, 2]));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
