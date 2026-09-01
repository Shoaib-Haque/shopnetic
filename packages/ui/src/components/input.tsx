'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Project text input wrapper (plan/CODING-RULES.md §D1). Owns the `'use client'`
 * boundary and the token-based styling; `invalid` wires `aria-invalid` + the
 * error ring so forms stay consistent.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ?? undefined}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
});
