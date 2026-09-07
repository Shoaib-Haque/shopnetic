'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn, type ButtonProps } from '@shopnetic/ui';

/** literal strings so Tailwind's JIT can see every variant */
const COLLAPSE = {
  sm: 'hidden sm:inline',
  md: 'hidden md:inline',
  lg: 'hidden lg:inline',
} as const;

export interface ActionButtonProps extends ButtonProps {
  /** Leading icon (hidden while `loading` — the spinner takes its place). */
  icon?: LucideIcon;
  /** Hide the text label below a breakpoint; the icon stays. `true` → `sm`. */
  collapseLabel?: boolean | keyof typeof COLLAPSE;
}

/**
 * `Button` + a leading icon + an optionally responsive label — for `+ New`,
 * `Export`, row `Edit`, etc.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { icon: Icon, collapseLabel = false, className, children, ...props },
  ref,
) {
  const bp = collapseLabel === true ? 'sm' : collapseLabel || undefined;
  return (
    <Button ref={ref} className={cn('gap-1.5', className)} {...props}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children != null && <span className={cn(bp && COLLAPSE[bp])}>{children}</span>}
    </Button>
  );
});
