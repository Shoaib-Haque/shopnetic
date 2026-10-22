import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUrlParamsSync } from './use-url-params-sync';

const PATHNAME = '/en/x7f2k9t3m1qp/things';

vi.mock('next/navigation', () => ({
  usePathname: () => PATHNAME,
}));

describe('useUrlParamsSync', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
  });

  it('replaces with the bare pathname when every param is falsy', () => {
    renderHook(() => useUrlParamsSync({ q: '', status: undefined }));
    expect(replaceStateSpy).toHaveBeenCalledWith(window.history.state, '', PATHNAME);
  });

  it('writes one query param per truthy value, in insertion order', () => {
    renderHook(() => useUrlParamsSync({ status: 'archived', q: 'shoaib' }));
    expect(replaceStateSpy).toHaveBeenCalledWith(
      window.history.state,
      '',
      `${PATHNAME}?status=archived&q=shoaib`,
    );
  });

  it('omits a falsy value (empty string, undefined, null, or explicit false) but keeps the others', () => {
    renderHook(() => useUrlParamsSync({ a: 'x', b: '', c: undefined, d: null, e: false, f: 'y' }));
    expect(replaceStateSpy).toHaveBeenCalledWith(window.history.state, '', `${PATHNAME}?a=x&f=y`);
  });

  it('re-syncs (calls replaceState again) when a value changes', () => {
    const { rerender } = renderHook(({ q }: { q: string }) => useUrlParamsSync({ q }), {
      initialProps: { q: '' },
    });
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);

    rerender({ q: 'sukanto' });
    expect(replaceStateSpy).toHaveBeenCalledTimes(2);
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      `${PATHNAME}?q=sukanto`,
    );
  });
});
