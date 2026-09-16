'use client';

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Slide-in side panel over the same Radix primitive `Modal` uses (focus
 * trap, Escape-to-close, backdrop click-to-close — real dialog semantics,
 * just positioned at an edge and animated as a slide instead of a centered
 * scale-in). Use for a collapsible group of controls (filters, bulk
 * settings) that's too much for the page's own toolbar row but doesn't
 * warrant leaving the page (plan/CODING-RULES.md G11 — panel-scale
 * transitions get the slower 300ms treatment, matching the sidebar's own
 * mobile drawer, not a popover's quick 100–150ms).
 *
 * `<Drawer open onOpenChange>` … `<DrawerContent>` with `<DrawerHeader>` /
 * `<DrawerTitle>` / `<DrawerBody>` inside.
 */
export const Drawer = RDialog.Root;
export const DrawerTrigger = RDialog.Trigger;
export const DrawerClose = RDialog.Close;

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof RDialog.Content> {
  /** Already-localized label for the close button (defaults to "Close"). */
  closeLabel?: string;
}

export const DrawerContent = forwardRef<ElementRef<typeof RDialog.Content>, DrawerContentProps>(
  function DrawerContent({ className, children, closeLabel = 'Close', ...props }, ref) {
    return (
      <RDialog.Portal>
        <RDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-300 ease-out',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        <RDialog.Content
          ref={ref}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border',
            'bg-background shadow-xl transition-transform duration-300 ease-out focus:outline-none',
            'data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
            className,
          )}
          {...props}
        >
          {children}
          <RDialog.Close
            aria-label={closeLabel}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </RDialog.Close>
        </RDialog.Content>
      </RDialog.Portal>
    );
  },
);

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('shrink-0 border-b border-border px-5 py-4 pr-12', className)} {...props} />
  );
}

export const DrawerTitle = forwardRef<
  ElementRef<typeof RDialog.Title>,
  ComponentPropsWithoutRef<typeof RDialog.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <RDialog.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />
  );
});

export function DrawerBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4', className)}
      {...props}
    />
  );
}
