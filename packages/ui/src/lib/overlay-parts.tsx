'use client';

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

/**
 * Shared internals for `Modal`/`Drawer`/`Popover` — not part of the
 * package's public API (not re-exported from `index.ts`). `Modal` and
 * `Drawer` are both built on `@radix-ui/react-dialog`, so they share the
 * header/title wrapper directly; `Popover` is built on
 * `@radix-ui/react-popover` instead, so only the close button (same look,
 * different corner offset) is generalized across all three via an injected
 * `as` component rather than assuming one Radix namespace.
 */

const CLOSE_BUTTON_BASE =
  'absolute rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function OverlayCloseButton({
  as: Close,
  position,
  closeLabel = 'Close',
}: {
  /** The Radix `*.Close` component to render — `Modal`/`Drawer` pass
   * `RDialog.Close`, `Popover` passes `RPopover.Close`. */
  as: ElementType<{ 'aria-label'?: string; className?: string; children?: ReactNode }>;
  /** `Modal`/`Drawer` sit at the larger `right-3 top-3` offset (more header
   * padding to clear); `Popover`'s tighter `right-2 top-2` matches its
   * smaller padding. */
  position: 'corner-lg' | 'corner-sm';
  closeLabel?: string;
}) {
  return (
    <Close
      aria-label={closeLabel}
      className={cn(
        CLOSE_BUTTON_BASE,
        position === 'corner-lg' ? 'right-3 top-3' : 'right-2 top-2',
      )}
    >
      <X className="size-4" aria-hidden />
    </Close>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('shrink-0 border-b border-border px-5 py-4 pr-12', className)} {...props} />
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof RDialog.Title>,
  ComponentPropsWithoutRef<typeof RDialog.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <RDialog.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />
  );
});
