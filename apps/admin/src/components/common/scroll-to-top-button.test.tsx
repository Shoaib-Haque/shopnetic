import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScrollToTopButton, TooltipProvider } from '@shopnetic/ui';

const LABEL = 'Back to top';

/** jsdom never actually lays anything out — `scrollHeight`/`clientHeight`
 * default to 0, so a real "is this container scrollable" check would always
 * read false. Stub both directly on the element the component walks up to,
 * the same way a real admin-shell scroll container (taller content than its
 * box) would report them. */
function renderInScrollContainer() {
  const container = document.createElement('div');
  container.style.overflowY = 'auto';
  Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });
  Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true, writable: true });
  document.body.appendChild(container);

  render(
    <TooltipProvider delayDuration={0}>
      <ScrollToTopButton label={LABEL} />
    </TooltipProvider>,
    { container },
  );
  return container;
}

function scrollTo(container: HTMLElement | Window, top: number) {
  Object.defineProperty(container, 'scrollTop', { value: top, configurable: true });
  fireEvent.scroll(container);
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ScrollToTopButton', () => {
  it('is hidden until its scroll container passes the threshold', () => {
    const container = renderInScrollContainer();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    scrollTo(container, 301);
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();
  });

  it('hides again once scrolled back under the threshold', () => {
    const container = renderInScrollContainer();
    scrollTo(container, 301);
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();

    scrollTo(container, 50);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('clicking scrolls its own container back to the top, not the window', () => {
    const container = renderInScrollContainer();
    scrollTo(container, 500);

    const containerScrollTo = vi.fn();
    container.scrollTo = containerScrollTo;
    const windowScrollTo = vi.fn();
    window.scrollTo = windowScrollTo;

    fireEvent.click(screen.getByRole('button', { name: LABEL }));

    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it('still finds a scrollable ancestor that has not overflowed yet at mount time', () => {
    // The real bug this guards: Audit Log paginates rows in via "load on
    // scroll" — its container can render `overflow-y: auto` before it has
    // enough rows to actually overflow yet. Detection must key off the CSS
    // property alone, not "is it overflowing right now", or it silently
    // locks onto `window` (which never fires the container's own scroll
    // events) the first time this happens to be true at mount.
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    Object.defineProperty(container, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true }); // not overflowing yet
    Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true, writable: true });
    document.body.appendChild(container);

    render(
      <TooltipProvider delayDuration={0}>
        <ScrollToTopButton label={LABEL} />
      </TooltipProvider>,
      { container },
    );

    // more rows loaded in later, the container now genuinely overflows
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
    scrollTo(container, 301);

    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();

    const containerScrollTo = vi.fn();
    container.scrollTo = containerScrollTo;
    const windowScrollTo = vi.fn();
    window.scrollTo = windowScrollTo;
    fireEvent.click(screen.getByRole('button', { name: LABEL }));
    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it('falls back to the window when rendered with no scrollable ancestor', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <ScrollToTopButton label={LABEL} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    fireEvent.scroll(window);

    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();
  });
});
