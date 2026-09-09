'use client';

import { useTranslations } from 'next-intl';
import { Bell, ChevronDown, Menu, PanelLeft, Search } from 'lucide-react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shopnetic/ui';

interface TopbarProps {
  email: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobile: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}

export function Topbar({
  email,
  collapsed,
  onToggleCollapsed,
  onOpenMobile,
  onSignOut,
  signingOut,
}: TopbarProps) {
  const t = useTranslations('admin');
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label={t('shell.openMenu')}
        title={t('shell.openMenu')}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={t(collapsed ? 'shell.expandSidebar' : 'shell.collapseSidebar')}
        title={t(collapsed ? 'shell.expandSidebar' : 'shell.collapseSidebar')}
        aria-pressed={collapsed}
        className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
      >
        <PanelLeft className="size-5" aria-hidden />
      </button>

      <span className="font-semibold">{t('shell.appName')}</span>

      <div className="mx-auto hidden w-full max-w-md md:block">
        <div
          className="flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground"
          title={t('shell.searchSoon')}
          aria-disabled
        >
          <Search className="size-4" aria-hidden />
          <span>{t('shell.search')}</span>
        </div>
      </div>

      <button
        type="button"
        aria-label={t('shell.notifications')}
        title={t('shell.notifications')}
        className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:ml-0"
      >
        <Bell className="size-5" aria-hidden />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('shell.account')}
          className={cn(
            'flex items-center gap-2 rounded-md px-1.5 py-1 outline-none',
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
            {initials}
          </span>
          <span className="hidden max-w-40 truncate text-sm sm:inline">{email}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onSignOut();
            }}
            data-disabled={signingOut ? '' : undefined}
          >
            {signingOut ? t('shell.signingOut') : t('shell.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
