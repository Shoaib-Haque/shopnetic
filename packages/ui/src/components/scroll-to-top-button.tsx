'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const SHOW_AFTER_PX = 300;

/**
 * A translucent, backdrop-blurred surface — distinct from every other
 * solid-background surface in the kit (cards, modals, toasts). Exported so a
 * *future* button can opt into the same look without duplicating the class
 * string; nothing existing uses it today, and adopting it elsewhere is a
 * deliberate per-button call, not a new default.
 */
// Tinted with `foreground`, not `background`: the two tokens are defined to
// always contrast with each other (dark-on-light in light mode, light-on-
// dark in dark mode), so this reads as visible glass against a same-toned
// page in either theme. A `background`-tinted glass looks identical to the
// page itself whenever the page happens to already be that color — which,
// on a mostly-white admin panel in light mode, is most of the time.
export const GLASS_SURFACE =
  'border border-foreground/15 bg-foreground/10 shadow-lg backdrop-blur-lg supports-[backdrop-filter]:bg-foreground/[0.07]';

export interface ScrollToTopButtonProps {
  /** Localized text — used as both the hover tooltip and the aria-label. */
  label: string;
  className?: string;
}

/**
 * A floating "back to top" affordance for long lists. Finds its nearest
 * scrollable ancestor at mount instead of requiring a ref threaded down from
 * the app shell — the admin shell scrolls an inner `overflow-y-auto` div,
 * not `window` (plan/CODING-RULES.md's shell layout), so a plain
 * `window.scrollY` listener would never fire. Renders `position: fixed`, so
 * it overlays correctly regardless of which ancestor actually scrolls.
 */
export function ScrollToTopButton({ label, className }: ScrollToTopButtonProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    // Matched purely on the CSS property, not on whether it's *currently*
    // overflowing: a cursor-paginated list (Audit Log's "load on scroll")
    // can render its first page before it has enough rows to overflow yet,
    // so a "does it overflow right now" check taken once at mount would
    // wrongly skip the real container and lock onto `window` for good.
    let scrollParent: HTMLElement | Window = window;
    let node = anchor.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollParent = node;
        break;
      }
      node = node.parentElement;
    }
    scrollParentRef.current = scrollParent;

    const getScrollTop = () =>
      scrollParent === window ? window.scrollY : (scrollParent as HTMLElement).scrollTop;

    const onScroll = () => setVisible(getScrollTop() > SHOW_AFTER_PX);
    onScroll();

    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={anchorRef} className="contents">
      {visible && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={() => scrollParentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className={cn(
                'fixed bottom-6 right-6 z-30 flex size-11 items-center justify-center rounded-full',
                'text-foreground transition-opacity hover:opacity-90',
                GLASS_SURFACE,
                className,
              )}
            >
              <ArrowUp className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
