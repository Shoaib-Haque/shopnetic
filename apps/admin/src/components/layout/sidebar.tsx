'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { cn, Spinner } from '@shopnetic/ui';
import { NAV_SECTIONS } from './nav-config';

interface SidebarProps {
  root: string; // /<locale>/<basePath>
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}

export function Sidebar({
  root,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onSignOut,
  signingOut,
}: SidebarProps) {
  return (
    <>
      {/* desktop rail */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 md:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        <SidebarBody
          root={root}
          collapsed={collapsed}
          onSignOut={onSignOut}
          signingOut={signingOut}
        />
      </aside>

      {/* mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-foreground/30 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background shadow-xl transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <SidebarBody
            root={root}
            collapsed={false}
            onNavigate={onCloseMobile}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </aside>
      </div>
    </>
  );
}

function SidebarBody({
  root,
  collapsed,
  onNavigate,
  onSignOut,
  signingOut,
}: {
  root: string;
  collapsed: boolean;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.key} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(`nav.sections.${section.key}`)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const label = t(`nav.${item.key}`);
                const href = item.path !== undefined ? `${root}${item.path}` : undefined;
                const active =
                  href !== undefined &&
                  (item.path === '' ? pathname === href : pathname.startsWith(href));
                const Icon = item.icon;
                const inner = (
                  <>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{label}</span>}
                    {!collapsed && item.soon && (
                      <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t('shell.soon')}
                      </span>
                    )}
                  </>
                );
                const base = cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                  collapsed && 'justify-center',
                );
                if (!href || item.soon) {
                  return (
                    <li key={item.key}>
                      <span
                        className={cn(base, 'cursor-not-allowed text-muted-foreground/60')}
                        {...(collapsed ? { title: `${label} — ${t('shell.soon')}` } : {})}
                        aria-disabled
                      >
                        {inner}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.key}>
                    <Link
                      href={href}
                      onClick={() => onNavigate?.()}
                      {...(collapsed ? { title: label } : {})}
                      {...(active ? { 'aria-current': 'page' as const } : {})}
                      className={cn(
                        base,
                        active
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex h-12 shrink-0 items-center border-t border-border px-2">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          title={collapsed ? t('shell.signOut') : undefined}
          className={cn(
            'flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50',
            collapsed && 'justify-center',
          )}
        >
          {signingOut ? <Spinner /> : <LogOut className="size-4 shrink-0" aria-hidden />}
          {!collapsed && <span>{signingOut ? t('shell.signingOut') : t('shell.signOut')}</span>}
        </button>
      </div>
    </div>
  );
}
