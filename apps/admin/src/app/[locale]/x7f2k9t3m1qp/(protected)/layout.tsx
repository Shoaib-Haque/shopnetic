import type { ReactNode } from 'react';

/**
 * Protected admin shell. STUB: in Phase 0 this becomes a Server Component that
 * verifies the staff session (redirect to ../login if absent) and builds the nav
 * from the actor's permissions (plan/03, plan/23 §3). For now it just renders.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}
