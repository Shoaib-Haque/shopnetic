'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RSelect from '@radix-ui/react-select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Project select wrapper over Radix (plan/CODING-RULES.md D1). Unlike a native
 * `<select>`, the open listbox is a regular positioned element (same
 * floating-ui engine `Popover`/`DropdownMenu` already use) — it auto-flips to
 * stay inside the viewport instead of running off the screen edge, and every
 * part of it (including each option's text) is normal CSS, so `truncate`
 * actually works on an option label instead of needing to be pre-capped at
 * the string level (G7). App code imports these, never `@radix-ui/*` or a
 * bare `<select>` directly.
 */
export const Select = RSelect.Root;
export const SelectGroup = RSelect.Group;
export const SelectValue = RSelect.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof RSelect.Trigger>,
  ComponentPropsWithoutRef<typeof RSelect.Trigger> & { invalid?: boolean }
>(function SelectTrigger({ className, invalid, children, ...props }, ref) {
  return (
    <RSelect.Trigger
      ref={ref}
      aria-invalid={invalid ?? undefined}
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    >
      {children}
      <RSelect.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </RSelect.Icon>
    </RSelect.Trigger>
  );
});

export const SelectContent = forwardRef<
  ElementRef<typeof RSelect.Content>,
  ComponentPropsWithoutRef<typeof RSelect.Content>
>(function SelectContent(
  { className, children, position = 'popper', sideOffset = 4, ...props },
  ref,
) {
  return (
    <RSelect.Portal>
      <RSelect.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={cn(
          'sn-popover z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden',
          'rounded-md border border-border bg-background text-sm shadow-md',
          position === 'popper' &&
            'w-[var(--radix-select-trigger-width)] max-w-[min(28rem,calc(100vw_-_2rem))]',
          className,
        )}
        {...props}
      >
        <RSelect.ScrollUpButton className="flex h-6 cursor-default items-center justify-center">
          <ChevronUp className="size-4" aria-hidden />
        </RSelect.ScrollUpButton>
        <RSelect.Viewport className="p-1">{children}</RSelect.Viewport>
        <RSelect.ScrollDownButton className="flex h-6 cursor-default items-center justify-center">
          <ChevronDown className="size-4" aria-hidden />
        </RSelect.ScrollDownButton>
      </RSelect.Content>
    </RSelect.Portal>
  );
});

export const SelectItem = forwardRef<
  ElementRef<typeof RSelect.Item>,
  ComponentPropsWithoutRef<typeof RSelect.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <RSelect.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none',
        'truncate data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'hover:bg-primary/80 hover:text-primary-foreground',
        'data-[highlighted]:bg-primary/80 data-[highlighted]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      {/* Radix's `ItemText` deliberately drops `className`/`style` (its
       * content is also portaled verbatim into the trigger's `SelectValue`,
       * so Radix won't let per-item styles leak there) — and being an
       * unstyled direct child of this flex row, it'd be the flex item that
       * won't shrink (flex's `min-width: auto` default) regardless. Put our
       * own flex item *around* it instead, so `min-w-0`/`truncate` land on
       * something Radix can't strip, with `ItemText` reduced to plain inline
       * content inside it. */}
      <span className="min-w-0 flex-1 truncate">
        <RSelect.ItemText>{children}</RSelect.ItemText>
      </span>
    </RSelect.Item>
  );
});

export const SelectLabel = forwardRef<
  ElementRef<typeof RSelect.Label>,
  ComponentPropsWithoutRef<typeof RSelect.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <RSelect.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
});

export const SelectSeparator = forwardRef<
  ElementRef<typeof RSelect.Separator>,
  ComponentPropsWithoutRef<typeof RSelect.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <RSelect.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});
