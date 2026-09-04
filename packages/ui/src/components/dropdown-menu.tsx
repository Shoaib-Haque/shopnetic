'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RDropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';

/**
 * Project dropdown-menu wrapper over Radix (plan/CODING-RULES.md D1). App code
 * imports these, never `@radix-ui/*` directly. Used for the topbar account menu
 * and per-row `⋮` action menus.
 */
export const DropdownMenu = RDropdown.Root;
export const DropdownMenuTrigger = RDropdown.Trigger;
export const DropdownMenuGroup = RDropdown.Group;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof RDropdown.Content>,
  ComponentPropsWithoutRef<typeof RDropdown.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  return (
    <RDropdown.Portal>
      <RDropdown.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-md border border-border bg-background p-1 text-sm shadow-md',
          className,
        )}
        {...props}
      />
    </RDropdown.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof RDropdown.Item>,
  ComponentPropsWithoutRef<typeof RDropdown.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <RDropdown.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none',
        'focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        destructive && 'text-destructive focus:bg-destructive/10',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof RDropdown.Label>,
  ComponentPropsWithoutRef<typeof RDropdown.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <RDropdown.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof RDropdown.Separator>,
  ComponentPropsWithoutRef<typeof RDropdown.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <RDropdown.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});
