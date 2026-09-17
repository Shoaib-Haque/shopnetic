'use client';

import { useDebouncedValue } from './use-debounced-value';

/**
 * `useDebouncedValue` for a search box, specifically: debounces `value`, then
 * trims the result. The trim only ever applies to this *derived* copy — the
 * raw `value` driving the visible input is never touched, so typing
 * "  shoaib  shopnetic  " still shows exactly that while typing (the
 * multi-word OR-match search already handles the stray whitespace/casing on
 * the server side). Without this, a whitespace-only query (`'   '`) is still
 * a truthy, changed string, so callers using the debounced value directly
 * for `resetKeys`/URL-sync/server-param decisions treat it as an active
 * search — an unnecessary reload + skeleton flash, and URL query-string
 * noise, for something that was never really a search.
 */
export function useDebouncedSearch(value: string, delayMs = 250): string {
  return useDebouncedValue(value, delayMs).trim();
}
