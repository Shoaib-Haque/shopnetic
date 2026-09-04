'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Checkbox wrapper over Radix (plan/CODING-RULES.md D1). Supports the
 * `indeterminate` state for "some rows selected" headers.
 */
export const Checkbox = forwardRef<
  ElementRef<typeof RCheckbox.Root>,
  ComponentPropsWithoutRef<typeof RCheckbox.Root>
>(function Checkbox({ className, checked, ...props }, ref) {
  return (
    <RCheckbox.Root
      ref={ref}
      {...(checked !== undefined ? { checked } : {})}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded border border-input bg-background outline-none',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RCheckbox.Indicator>
        {checked === 'indeterminate' ? (
          <Minus className="size-3" aria-hidden />
        ) : (
          <Check className="size-3" aria-hidden />
        )}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
});
