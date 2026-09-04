'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from '@shopnetic/ui';
import { postJson } from '@/features/staff-auth/submit';
import { Topbar } from './topbar';
import { Sidebar } from './sidebar';
import { Footer } from './footer';
import { useSidebar } from './use-sidebar';

const TOPBAR_PX = 56;

/**
 * The protected admin frame: fixed topbar + collapsible sidebar + scrollable
 * main column + footer. Only the main column scrolls; the sidebar scrolls
 * independently when its own content is taller than the viewport.
 */
export function AdminShell({
  email,
  root,
  loginHref,
  children,
}: {
  email: string;
  root: string;
  loginHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    await postJson('/api/staff-auth/logout', {});
    router.replace(loginHref);
    router.refresh();
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar
        email={email}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onOpenMobile={() => setMobileOpen(true)}
        onSignOut={signOut}
        signingOut={signingOut}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          root={root}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onSignOut={signOut}
          signingOut={signingOut}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {/* left-aligned, soft cap so tables don't sprawl on ultra-wide screens */}
          <main className="w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
          <Footer />
        </div>
      </div>
      <Toaster topOffset={TOPBAR_PX + 12} />
    </div>
  );
}
