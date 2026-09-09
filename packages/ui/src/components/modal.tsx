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
        <RDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
        <RDialog.Content
          ref={ref}
          className={cn(
            // sits a little above true vertical center (readers' eyes land
            // there first, and it keeps the modal clear of a spot the
            // on-screen keyboard usually covers) — `-translate-y-1/2` still
            // centers *the modal itself* around that point, so tall content
            // grows evenly and short content doesn't look off-balance.
            'fixed left-1/2 top-[42%] z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2',
            '-translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-xl',
            'focus:outline-none',
            SIZES[size],
            className,
          )}
          {...props}
        >
          {children}
          {!hideClose && (
            <RDialog.Close
              aria-label={closeLabel}
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </RDialog.Close>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    );
  },
);

export function ModalHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('shrink-0 border-b border-border px-5 py-4 pr-12', className)} {...props} />
  );
}

export const ModalTitle = forwardRef<
  ElementRef<typeof RDialog.Title>,
  ComponentPropsWithoutRef<typeof RDialog.Title>
>(function ModalTitle({ className, ...props }, ref) {
  return (
    <RDialog.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />
  );
});

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
