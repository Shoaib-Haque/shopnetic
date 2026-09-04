import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Coloured status pill (plan/CODING-RULES.md D3). Call sites map a domain status
 * to a `tone` and pass the already-localized label as children.
 */
const TONES = {
  success: 'bg-success-muted text-success ring-success/30',
  warning: 'bg-warning-muted text-warning ring-warning/30',
  danger: 'bg-destructive/10 text-destructive ring-destructive/30',
  neutral: 'bg-muted text-muted-foreground ring-border',
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
