import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedSearch } from './use-debounced-search';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedSearch', () => {
  it('debounces like useDebouncedValue — stays at the initial value until the delay passes', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedSearch(value, 250), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');

    rerender({ value: 'ab' });
    expect(result.current).toBe('a'); // not yet — delay hasn't passed

    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('ab');
  });

  it('trims the debounced value — a whitespace-only query settles to empty, not a truthy blank string', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedSearch(value, 250), {
      initialProps: { value: '' },
    });

    rerender({ value: '   ' });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('');
  });

  it('trims leading/trailing whitespace but keeps internal words intact', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedSearch(value, 250), {
      initialProps: { value: '' },
    });

    rerender({ value: '  shoaib  shopnetic  ' });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('shoaib  shopnetic');
  });
});
