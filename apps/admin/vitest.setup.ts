import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { toast } from '@shopnetic/ui';
import { installIntersectionObserverMock } from './src/test/intersection-observer';

installIntersectionObserverMock();

// `notify.*`/`toast.*` push into sonner's own module-level store, which
// outlives any one test's React tree — `renderAdmin` mounts a fresh
// `<Toaster/>` per test, but a toast triggered in test N is still queued
// there and renders again the moment test N+1 mounts its own `<Toaster/>`,
// with no relation to that test's own assertions (found via a real,
// reproducible failure: two toast-triggering tests back to back in the
// same file, the second one's `not.toBeInTheDocument()` check on a generic
// error caught the *first* test's still-lingering toast). Global, not a
// per-file `afterEach`, since any test file that renders `<Toaster/>` more
// than once could hit this the same way.
afterEach(() => {
  toast.dismiss();
});

// jsdom doesn't implement matchMedia. category-list.tsx calls it directly
// (the `pointer: fine` drag-capability check) — without this every render
// throws `window.matchMedia is not a function`.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom doesn't implement scrollIntoView either — the row-flash effect
// (category-list.tsx) calls it after a move/undo/restore.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Radix (DropdownMenu, Modal/Dialog, …) opens/closes via pointer events and
// pointer-capture — without these, `fireEvent.click` on a Radix trigger
// silently no-ops instead of opening it, since jsdom's PointerEvent support
// is incomplete and the capture methods don't exist at all.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom doesn't implement ResizeObserver — Radix's `Switch` uses it
// internally (`@radix-ui/react-use-size`, to size the thumb) via a layout
// effect that runs on every mount, so any test rendering a `Switch` throws
// `ResizeObserver is not defined` without this.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
