import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Accessible loading indicator. */
export function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
