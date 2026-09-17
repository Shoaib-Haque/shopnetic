'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RPopover from '@radix-ui/react-popover';
import { cn } from '../lib/cn';
import { OverlayCloseButton } from '../lib/overlay-parts';

/**
 * Anchored panel over Radix `Popover` (plan/CODING-RULES.md D1) — non-modal:
 * unlike `Modal`/`Drawer` (built on `Dialog`, which traps focus and blocks
 * pointer events on the rest of the page while open), this doesn't block
 * anything outside it. A click on some other control (a search box, another
 * field) reaches that control *and* dismisses the popover in the same
 * interaction, instead of needing an explicit close first. Use for a small
 * cluster of controls meant to be used alongside something else already on
 * screen (quick filters next to a search box); reach for `Drawer` when the
 * panel is the thing the user is supposed to focus on exclusively (a
 * create/edit form, a bulk action).
 *
 * `<Popover open onOpenChange>` … `<PopoverContent>` — same `sn-popover`
 * scale+fade `DropdownMenuContent` already uses (popover-scale, not
 * panel-scale — see G11).
 */
export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverClose = RPopover.Close;
export const PopoverAnchor = RPopover.Anchor;

export interface PopoverContentProps extends ComponentPropsWithoutRef<typeof RPopover.Content> {
  /** Already-localized label for the close button (defaults to "Close"). */
  closeLabel?: string;
}

export const PopoverContent = forwardRef<ElementRef<typeof RPopover.Content>, PopoverContentProps>(
  function PopoverContent(
    { className, children, align = 'end', sideOffset = 8, closeLabel = 'Close', ...props },
    ref,
  ) {
    return (
      <RPopover.Portal>
        <RPopover.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'sn-popover z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border',
            'bg-background p-4 shadow-md focus:outline-none',
            className,
          )}
          {...props}
        >
          {children}
          <OverlayCloseButton as={RPopover.Close} position="corner-sm" closeLabel={closeLabel} />
        </RPopover.Content>
      </RPopover.Portal>
    );
  },
);
