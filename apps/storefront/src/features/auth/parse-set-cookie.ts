import { parseSetCookie } from '@shopnetic/http-client';

/**
 * Pulls the `sn_rt` value — or a "was cleared" signal — out of the identity
 * API's `Set-Cookie` response lines. Kept free of `server-only` so it is unit
 * testable.
 */
export function parseRefreshSetCookie(setCookies: string[]): { value?: string; cleared: boolean } {
  return parseSetCookie(setCookies, 'sn_rt');
}
