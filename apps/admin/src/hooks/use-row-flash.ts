'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Briefly highlights a row (`sn-row-flash`, applied by the caller off
 * `flashId === row.id`) and scrolls it into view — for "here's the row that
 * just moved / was restored / is what a deep link landed on." Parameterized
 * by the `data-*` attribute each row carries its id on (e.g. `data-cat-row`,
 * `data-staff-row`) so the same hook serves every list that has one.
 *
 * Bounded to 1400ms and self-clearing; a second `flash()` call while one is
 * still active restarts the timer on the new id rather than stacking.
 * Mount-safety is handled internally (`if (mounted) setFlashId(null)` in the
 * timeout callback) — a caller that used to hand-roll this without the guard
 * (Staff List did) risked a `setState` after unmount if the page changed
 * within the 1400ms window; every consumer gets the fix for free here.
 */
export function useRowFlash(
  dataAttr: string,
  options?: {
    /** `scrollIntoView`'s block alignment — default matches most lists'
     * existing behavior (nearest edge, minimal scroll). */
    block?: ScrollLogicalPosition;
    /** Re-run the scroll-into-view when this value changes, in addition to
     * `flashId` itself — for a list that reloads/re-sorts and needs to find
     * the row again once it lands on its final position (Category List's
     * `items`, after a reorder resync). Omit for a list with no such case. */
    rescrollOn?: unknown;
  },
): { flashId: string | null; flash: (id: string) => void } {
  const [flashId, setFlashId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setFlashId(null);
    }, 1400);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    document
      .querySelector(`[${dataAttr}="${CSS.escape(flashId)}"]`)
      ?.scrollIntoView({ block: options?.block ?? 'nearest' });
  }, [flashId, dataAttr, options?.block, options?.rescrollOn]);

  return { flashId, flash };
}
