import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUrlParamsSync } from './use-url-params-sync';

const PATHNAME = '/en/x7f2k9t3m1qp/things';
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => PATHNAME,
}));

beforeEach(() => {
  routerReplace.mockReset();
});

describe('useUrlParamsSync', () => {
  it('replaces with the bare pathname when every param is falsy', () => {
    renderHook(() => useUrlParamsSync({ q: '', status: undefined }));
    expect(routerReplace).toHaveBeenCalledWith(PATHNAME, { scroll: false });
  });

  it('writes one query param per truthy value, in insertion order', () => {
    renderHook(() => useUrlParamsSync({ status: 'archived', q: 'shoaib' }));
    expect(routerReplace).toHaveBeenCalledWith(`${PATHNAME}?status=archived&q=shoaib`, {
      scroll: false,
    });
  });

  it('omits a falsy value (empty string, undefined, null, or explicit false) but keeps the others', () => {
    renderHook(() => useUrlParamsSync({ a: 'x', b: '', c: undefined, d: null, e: false, f: 'y' }));
    expect(routerReplace).toHaveBeenCalledWith(`${PATHNAME}?a=x&f=y`, { scroll: false });
  });

  it('re-syncs (calls replace again) when a value changes', () => {
    const { rerender } = renderHook(({ q }: { q: string }) => useUrlParamsSync({ q }), {
      initialProps: { q: '' },
    });
    expect(routerReplace).toHaveBeenCalledTimes(1);

    rerender({ q: 'sukanto' });
    expect(routerReplace).toHaveBeenCalledTimes(2);
    expect(routerReplace).toHaveBeenLastCalledWith(`${PATHNAME}?q=sukanto`, { scroll: false });
  });
});
