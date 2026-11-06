import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Label + control + hint/error row. No interactivity, so no `'use client'` — it
 * composes fine inside a client form. One shared field layout (plan/CODING-RULES.md section D3).
 */
export interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  error?: string | undefined;
  hint?: string | undefined;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, action, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint !== undefined && error === undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error !== undefined ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
