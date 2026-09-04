'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sn_adm_sidebar_collapsed';

/**
 * Sidebar state. `collapsed` (desktop icon-rail) persists in `localStorage`,
 * default expanded. `mobileOpen` is the transient drawer state, never persisted.
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  return { collapsed, toggleCollapsed, mobileOpen, setMobileOpen };
}
