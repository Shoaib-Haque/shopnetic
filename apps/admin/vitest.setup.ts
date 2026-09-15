import '@testing-library/jest-dom/vitest';

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
