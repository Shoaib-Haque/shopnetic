'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, LogOut, X } from 'lucide-react';
import { cn, Spinner } from '@shopnetic/ui';
import { visibleNavSections, type NavItem } from './nav-config';

interface SidebarProps {
  root: string; // /<locale>/<basePath>
  roles: readonly string[];
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}

export function Sidebar({
  root,
  roles,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onSignOut,
  signingOut,
  expandedGroups,
  onToggleGroup,
}: SidebarProps) {
  return (
    <>
      {/* desktop rail */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-300 ease-out md:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        <SidebarBody
          root={root}
          roles={roles}
          collapsed={collapsed}
          onSignOut={onSignOut}
          signingOut={signingOut}
          expandedGroups={expandedGroups}
          onToggleGroup={onToggleGroup}
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
            'absolute inset-0 bg-foreground/30 transition-opacity duration-300 ease-out',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background shadow-xl transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <SidebarBody
            root={root}
            roles={roles}
            collapsed={false}
            onNavigate={onCloseMobile}
            onClose={onCloseMobile}
            onSignOut={onSignOut}
            signingOut={signingOut}
            expandedGroups={expandedGroups}
            onToggleGroup={onToggleGroup}
          />
        </aside>
      </div>
    </>
  );
}

function SidebarBody({
  root,
  roles,
  collapsed,
  onNavigate,
  onClose,
  onSignOut,
  signingOut,
  expandedGroups,
  onToggleGroup,
}: {
  root: string;
  roles: readonly string[];
  collapsed: boolean;
  onNavigate?: () => void;
  /** mobile drawer only — renders an explicit close button by the first heading */
  onClose?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  function hrefFor(path: string): string {
    return `${root}${path}`;
  }

  function isActiveHref(path: string): boolean {
    const href = hrefFor(path);
    return path === '' ? pathname === href : pathname.startsWith(href);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('actions.close')}
          className="absolute right-1.5 top-2 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleNavSections(roles).map((section) => (
          <div key={section.key} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(`nav.sections.${section.key}`)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItemRow
                  key={item.key}
                  item={item}
                  collapsed={collapsed}
                  expanded={expandedGroups[item.key] ?? false}
                  onToggleGroup={onToggleGroup}
                  onNavigate={onNavigate}
                  hrefFor={hrefFor}
                  isActiveHref={isActiveHref}
                />
              ))}
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

function NavItemRow({
  item,
  collapsed,
  expanded,
  onToggleGroup,
  onNavigate,
  hrefFor,
  isActiveHref,
}: {
  item: NavItem;
  collapsed: boolean;
  /** only meaningful when `item.children` exists — whether the caller has
   * explicitly toggled this group open; defaulted below to "a child is the
   * current page" when the caller has no opinion yet (`undefined`). */
  expanded: boolean;
  onToggleGroup: (key: string) => void;
  onNavigate: (() => void) | undefined;
  hrefFor: (path: string) => string;
  isActiveHref: (path: string) => boolean;
}) {
  const t = useTranslations('admin');
  const label = t(`nav.${item.key}`);
  const Icon = item.icon;
  const base = cn(
    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
    collapsed && 'justify-center',
  );

  if (item.children) {
    const anyChildActive = item.children.some((c) => isActiveHref(c.path));
    // `isActiveHref` is a prefix match, so "/staff" matches "/staff/invite"
    // too — only the longest (most specific) matching child should show as
    // current, not every ancestor path along the way.
    const activeChildKey = item.children
      .filter((c) => isActiveHref(c.path))
      .reduce<string | undefined>((bestKey, c) => {
        if (!bestKey) return c.key;
        const best = item.children!.find((x) => x.key === bestKey)!;
        return c.path.length > best.path.length ? c.key : bestKey;
      }, undefined);
    // collapsed rail has no room for an indented submenu — the icon just
    // goes straight to the first child (the "list" page) instead
    if (collapsed) {
      const first = item.children[0]!;
      return (
        <li>
          <Link
            href={hrefFor(first.path)}
            title={label}
            {...(anyChildActive ? { 'aria-current': 'page' as const } : {})}
            className={cn(
              base,
              anyChildActive
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      );
    }
    // While one of its own children is the active route, the group is
    // always shown open — collapsing the section you're currently looking
    // at doesn't make sense, so the toggle is a no-op here rather than
    // updating `expanded` anyway. Without this, a click while `anyChildActive`
    // already forces the group open has no visible effect (masked by the
    // `||` below) but *does* still flip the hidden `expanded` bit, so its
    // parity — not anything the user can see — decides whether the group
    // stays open or collapses once they navigate to an unrelated page.
    // Ignoring the click here means `expanded` only ever changes from
    // *outside* this section, so leaving it always reflects whatever it was
    // set to before you arrived, regardless of how many times you clicked
    // while inside.
    const isOpen = anyChildActive || expanded;
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            if (anyChildActive) return;
            onToggleGroup(item.key);
          }}
          aria-expanded={isOpen}
          className={cn(base, 'w-full text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <ChevronDown
            className={cn(
              'ml-auto size-3.5 shrink-0 transition-transform duration-300 ease-out',
              isOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
        {/* Always mounted — a conditional `{isOpen && <ul>}` has nothing to
            animate from/to. `grid-rows-[0fr|1fr]` collapses/expands without
            a hardcoded max-height (CODING-RULES section G — state changes
            that hide/reveal content get a transition, not an instant
            show/hide). `inert` while closed keeps its links out of tab
            order and hit-testing even though the `<ul>` stays in the DOM. */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <ul
            className="ml-[1.625rem] mt-0.5 flex flex-col gap-0.5 overflow-hidden border-l border-border pl-2.5"
            inert={!isOpen}
          >
            {item.children.map((child) => {
              const childActive = child.key === activeChildKey;
              return (
                <li key={child.key}>
                  <Link
                    href={hrefFor(child.path)}
                    onClick={() => onNavigate?.()}
                    {...(childActive ? { 'aria-current': 'page' as const } : {})}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-sm',
                      childActive
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {t(`nav.${child.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </li>
    );
  }

  const href = item.path !== undefined ? hrefFor(item.path) : undefined;
  const active = href !== undefined && isActiveHref(item.path!);
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

  if (!href || item.soon) {
    return (
      <li>
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
    <li>
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
}
