import { parseSetCookie } from '@shopnetic/http-client';

export function parseRefreshSetCookie(setCookies: string[]): { value?: string; cleared: boolean } {
  return parseSetCookie(setCookies, 'sn_rt');
}
