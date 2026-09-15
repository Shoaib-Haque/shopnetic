/**
 * jsdom has no `IntersectionObserver` at all, and even if it did it has no
 * real layout engine to compute visibility from. `useScrollLoad`
 * (components/crud/use-scroll-load.ts) needs one to detect its sentinel
 * becoming visible — both "the first page didn't fill the viewport" (fires
 * on mount, before any real scroll) and "the user scrolled near the
 * bottom". This installs a controllable mock: each `observe(el)` call is
 * recorded, and a test triggers it directly with `triggerIntersection(el)`
 * instead of trying to fake real geometry.
 */
type Callback = IntersectionObserverCallback;

const observed = new Map<Element, Callback>();

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  private callback: Callback;

  constructor(callback: Callback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    observed.set(target, this.callback);
  }

  unobserve(target: Element): void {
    observed.delete(target);
  }

  disconnect(): void {
    for (const [target, cb] of observed) {
      if (cb === this.callback) observed.delete(target);
    }
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

export function installIntersectionObserverMock(): void {
  observed.clear();
  (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
}

/** Simulate the sentinel entering (or leaving) the viewport. */
export function triggerIntersection(target: Element, isIntersecting = true): void {
  const callback = observed.get(target);
  if (!callback) return;
  const entry = { isIntersecting, target } as IntersectionObserverEntry;
  callback([entry], new MockIntersectionObserver(callback));
}
