'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sn_adm_sidebar_collapsed';

/**
 * Sidebar state. `collapsed` (desktop icon-rail) persists in `localStorage`,
 * default expanded. `mobileOpen` is the transient drawer state, never
 * persisted. `expandedGroups` (a nav item with `children`, e.g. "Staff") is
 * per-mount only too — it's keyed by `NavItem.key` and lives here (not in
 * `Sidebar` itself) so the desktop rail and the mobile drawer, which mount
 * two separate `SidebarBody`s, stay in sync rather than drifting apart.
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* private mode / disabled storage — keep the default */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggleCollapsed, mobileOpen, setMobileOpen, expandedGroups, toggleGroup };
}
