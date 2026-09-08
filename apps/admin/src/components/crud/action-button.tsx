'use client';

import { forwardRef, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn, type ButtonProps } from '@shopnetic/ui';

/** literal strings so Tailwind's JIT can see every variant */
const COLLAPSE = {
  sm: 'hidden sm:inline',
  md: 'hidden md:inline',
  lg: 'hidden lg:inline',
} as const;

/** the width below which each `collapseLabel` breakpoint hides the label */
const BELOW = {
  sm: '(max-width: 639.98px)',
  md: '(max-width: 767.98px)',
  lg: '(max-width: 1023.98px)',
} as const;

function useMatches(query: string | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!query) return;
    const mq = window.matchMedia(query);
    const sync = (): void => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

export interface ActionButtonProps extends ButtonProps {
  /** Leading icon (hidden while `loading` — the spinner takes its place). */
  icon?: LucideIcon;
  /** Hide the text label below a breakpoint; the icon stays. `true` → `sm`. */
  collapseLabel?: boolean | keyof typeof COLLAPSE;
}

/**
 * `Button` + a leading icon + an optionally responsive label — for `+ New`,
 * `Export`, row `Edit`, etc. While the label is collapsed to an icon, a native
 * `title` (the label text) stands in as a tooltip, unless the caller set one.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { icon: Icon, collapseLabel = false, className, children, ...props },
  ref,
) {
  const bp = collapseLabel === true ? 'sm' : collapseLabel || undefined;
  const iconOnly = useMatches(bp ? BELOW[bp] : undefined);
  const autoTitle =
    iconOnly && typeof children === 'string' && props.title == null ? children : undefined;
  return (
    <Button
      ref={ref}
      className={cn('gap-1.5', className)}
      {...props}
      {...(autoTitle ? { title: autoTitle } : {})}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children != null && <span className={cn(bp && COLLAPSE[bp])}>{children}</span>}
    </Button>
  );
});
