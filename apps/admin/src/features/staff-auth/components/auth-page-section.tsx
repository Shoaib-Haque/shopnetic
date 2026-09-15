import type { ReactNode } from 'react';

/**
 * Vertical alignment for one state of a public auth-flow page (login,
 * accept-invite, forgot/reset-password): a real form (inputs to fill)
 * centers vertically like `login` always has; a message-only state
 * (done/redirecting, invalid-link, check-your-email) sits near the top
 * instead. Centering a short one-liner mid-viewport reads as an
 * error/empty state, not "you're on the right page" — and since these
 * pages swap between states of very different heights, a consistently
 * centered layout makes the block visibly jump on every swap.
 *
 * The page's `<main>` stays a neutral `flex flex-col` shell; this is the
 * one piece that decides where content sits within it, chosen per state
 * by the form component (only it knows which state it's in).
 */
export function AuthPageSection({
  variant,
  children,
}: {
  variant: 'form' | 'message';
  children: ReactNode;
}) {
  return (
    <div className={variant === 'form' ? 'flex flex-1 flex-col justify-center' : 'pt-20 sm:pt-28'}>
      {children}
    </div>
  );
}
