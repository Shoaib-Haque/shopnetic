'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn, type ButtonProps } from '@shopnetic/ui';

export interface ActionButtonProps extends ButtonProps {
  /** Leading icon (hidden while `loading` — the spinner takes its place). */
  icon?: LucideIcon;
  /** Hide the text label below the `sm` breakpoint; the icon stays. */
  collapseLabel?: boolean;
}

/**
 * `Button` + a leading icon + an optionally responsive label — for `+ New`,
 * `Export`, row `Edit`, etc.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { icon: Icon, collapseLabel = false, className, children, ...props },
  ref,
) {
  return (
    <Button ref={ref} className={cn('gap-1.5', className)} {...props}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children != null && (
        <span className={cn(collapseLabel && 'hidden sm:inline')}>{children}</span>
      )}
    </Button>
  );
});
