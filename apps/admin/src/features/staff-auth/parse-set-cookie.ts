/**
 * Pulls the `sn_srt` value — or a "was cleared" signal — out of the identity
 * API's `Set-Cookie` response lines. Free of `server-only` so it is testable.
 */
export function parseStaffSetCookie(setCookies: string[]): { value?: string; cleared: boolean } {
  for (const line of setCookies) {
    const match = /^\s*sn_srt=([^;]*)/.exec(line);
    if (!match) continue;
    const value = match[1] ?? '';
    const cleared =
      value === '' || /max-age=0/i.test(line) || /expires=thu,\s*01\s*jan\s*1970/i.test(line);
    return cleared ? { cleared: true } : { value, cleared: false };
  }
  return { cleared: false };
}
