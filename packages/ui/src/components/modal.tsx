'use client';

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';
import { DialogHeader, DialogTitle, OverlayCloseButton } from '../lib/overlay-parts';

/**
 * Centered modal dialog over Radix (plan/CODING-RULES.md D1). The default
 * create/edit surface for simple admin entities — vertically + horizontally
 * centered, scrolls internally when the body is tall.
 *
 * `<Modal open onOpenChange>` … `<ModalContent size>` with `<ModalHeader>` /
 * `<ModalBody>` / `<ModalFooter>` inside.
 */
export const Modal = RDialog.Root;
export const ModalTrigger = RDialog.Trigger;
export const ModalClose = RDialog.Close;

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export interface ModalContentProps extends ComponentPropsWithoutRef<typeof RDialog.Content> {
  size?: keyof typeof SIZES;
  /** Hide the built-in close (×). */
  hideClose?: boolean;
  /** Already-localized label for the close button (defaults to "Close"). */
  closeLabel?: string;
}

export const ModalContent = forwardRef<ElementRef<typeof RDialog.Content>, ModalContentProps>(
  function ModalContent(
    { className, children, size = 'md', hideClose = false, closeLabel = 'Close', ...props },
    ref,
  ) {
    return (
      <RDialog.Portal>
        <RDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-300 ease-out',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        {/* Two nested layers, not one `fixed` + percentage-positioned panel
         * (the 2026-09-18 fix — that math put a tall panel's top edge above
         * the viewport with no way back, since a `fixed` element ignores
         * page scroll). Outer: a plain scrollable block — never `flex`
         * itself, which sidesteps a real cross-browser quirk where a flex
         * container's `align-items: center` combined with `overflow: auto`
         * can clip a child's top instead of scrolling to it. Inner: an
         * ordinary flex-center: `min-h-full` keeps it exactly viewport-tall
         * for short content (so it centers normally), and lets it grow
         * taller than that for a genuinely tall panel — which the *outer*
         * layer's own scroll then reaches every part of. */}
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <RDialog.Content
              ref={ref}
              className={cn(
                'relative flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col rounded-lg',
                'border border-border bg-background shadow-xl',
                // panel-scale (G11): a centered dialog fades + scales in/out,
                // not the slide Drawer uses from an edge — `transition-all`
                // (not per-property) since opacity and scale change together.
                'transition-all duration-300 ease-out focus:outline-none',
                'data-[state=closed]:scale-95 data-[state=open]:scale-100',
                'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
                SIZES[size],
                className,
              )}
              {...props}
            >
              {children}
              {!hideClose && (
                <OverlayCloseButton
                  as={RDialog.Close}
                  position="corner-lg"
                  closeLabel={closeLabel}
                />
              )}
            </RDialog.Content>
          </div>
        </div>
      </RDialog.Portal>
    );
  },
);

export const ModalHeader = DialogHeader;
export const ModalTitle = DialogTitle;

export const ModalDescription = forwardRef<
  ElementRef<typeof RDialog.Description>,
  ComponentPropsWithoutRef<typeof RDialog.Description>
>(function ModalDescription({ className, ...props }, ref) {
  return (
    <RDialog.Description
      ref={ref}
      className={cn('mt-1 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});

export function ModalBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function ModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}
