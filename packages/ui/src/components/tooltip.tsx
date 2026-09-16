'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RTooltip from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn';

/**
 * Hover-only affordance text for an icon-only control (plan/CODING-RULES.md
 * D1) — the `aria-label` already covers screen readers; this is what a
 * mouse/PC user gets on hover, since an `aria-label` alone is invisible to
 * them. One `TooltipProvider` wraps the whole app (`AdminShell`) so any page
 * can just use `Tooltip`/`TooltipTrigger`/`TooltipContent` directly.
 */
export const TooltipProvider = RTooltip.Provider;
export const Tooltip = RTooltip.Root;
export const TooltipTrigger = RTooltip.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof RTooltip.Content>,
  ComponentPropsWithoutRef<typeof RTooltip.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <RTooltip.Portal>
      <RTooltip.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'sn-popover z-50 rounded-md border border-border bg-background px-2 py-1',
          'text-xs text-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </RTooltip.Portal>
  );
});
