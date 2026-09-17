import { parseSetCookie } from '@shopnetic/http-client';

/**
 * Pulls the `sn_srt` value — or a "was cleared" signal — out of the identity
 * API's `Set-Cookie` response lines. Free of `server-only` so it is testable.
 */
export function parseStaffSetCookie(setCookies: string[]): { value?: string; cleared: boolean } {
  return parseSetCookie(setCookies, 'sn_srt');
}
