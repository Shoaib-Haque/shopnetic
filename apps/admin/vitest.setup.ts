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
