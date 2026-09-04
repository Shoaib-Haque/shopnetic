'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Password field with a show/hide toggle (plan/CODING-RULES.md section D1/section D3). The
 * toggle's `aria-label` is passed in already-translated (like `Button`'s
 * `loadingText`) so the shared library stays framework-agnostic.
 */
export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean;
  showLabel?: string;
  hideLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { className, invalid, showLabel = 'Show password', hideLabel = 'Hide password', ...props },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          aria-invalid={invalid ?? undefined}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
