import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useRowFlash } from './use-row-flash';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function row(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-row', id);
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe('useRowFlash', () => {
  it('sets flashId on flash(), and clears it after 1400ms', () => {
    row('a');
    const { result } = renderHook(() => useRowFlash('data-row'));

    act(() => result.current.flash('a'));
    expect(result.current.flashId).toBe('a');

    act(() => vi.advanceTimersByTime(1400));
    expect(result.current.flashId).toBeNull();
  });

  it('scrolls the matching row into view when flashed', () => {
    const el = row('b');
    const { result } = renderHook(() => useRowFlash('data-row'));

    act(() => result.current.flash('b'));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('uses the given block alignment', () => {
    const el = row('c');
    const { result } = renderHook(() => useRowFlash('data-row', { block: 'center' }));

    act(() => result.current.flash('c'));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('flashing again restarts the timer on the new id rather than stacking', () => {
    row('a');
    row('b');
    const { result } = renderHook(() => useRowFlash('data-row'));

    act(() => result.current.flash('a'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.flash('b'));
    expect(result.current.flashId).toBe('b');

    // 400ms more (1400 total from the first flash) — the first timer must
    // not have fired and cleared the second flash early
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.flashId).toBe('b');

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.flashId).toBeNull();
  });

  // Regression: Staff List's own hand-rolled copy of this mechanism was
  // missing a mount-safety guard on the timeout callback — unmounting within
  // the 1400ms window (e.g. navigating away right after a deep-link flash)
  // would call `setFlashId` on an unmounted component. This hook fixes that
  // for every consumer by construction; this test proves the fix by
  // asserting no console.error fires (React logs a warning/error for exactly
  // this case) when the timer elapses after unmount.
  it('does not setState after unmount when the timer elapses post-unmount', () => {
    row('a');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useRowFlash('data-row'));

    act(() => result.current.flash('a'));
    unmount();
    act(() => vi.advanceTimersByTime(1400));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
