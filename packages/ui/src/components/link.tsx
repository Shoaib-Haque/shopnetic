import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import NextLink from 'next/link';
import { cn } from '../lib/cn';

/**
 * Thin wrapper over `next/link` (plan/CODING-RULES.md D1) for a plain
 * inline/prose link — underlined by default (so it reads as a link amid
 * plain text) with a `hover:text-foreground` color shift for feedback once
 * hovering, since underline-on-its-own gives no "you're over it right now"
 * signal when it's already underlined at rest. Every call site used to
 * import `next/link` directly and hand-roll this className itself; some
 * got the hover state, some didn't, and it silently drifted (found live,
 * 2026-09-17 — "Back to sign in" had it on the form screens but not the
 * message screens). One shared default here instead.
 *
 * `className` merges on top via `cn` (tailwind-merge) — pass size/position
 * utilities (`text-sm`, `self-start`, …) per call site as usual; only the
 * underline/color/hover treatment is centralized.
 *
 * Not for: sidebar nav items or topbar/dropdown menu items (their own
 * `hover:bg-muted`-style treatment, not underline-based), or a link inside
 * a dense table cell where underlining every row by default would be
 * visual noise (Audit Log's Target column deep-link deliberately does the
 * reverse — underline only appears on hover). Those keep importing
 * `next/link` directly.
 */
export const Link = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(
  function Link({ className, ...props }, ref) {
    return (
      <NextLink
        ref={ref}
        className={cn(
          'underline underline-offset-2 text-muted-foreground hover:text-foreground',
          className,
        )}
        {...props}
      />
    );
  },
);
