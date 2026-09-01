import type { ReactNode } from 'react';

/**
 * Public route group — guest-visible, SSR/ISR, indexable (plan/23 §2, plan/10).
 * Shared storefront header/footer land here as `@shopnetic/ui` / `components/layout`
 * pieces are built.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-5xl px-4 py-10">{children}</div>;
}
