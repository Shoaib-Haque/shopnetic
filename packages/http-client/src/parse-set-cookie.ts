/**
 * Pulls a named cookie's value — or a "was cleared" signal — out of the
 * identity API's `Set-Cookie` response lines. Free of `server-only` so it
 * is unit testable. Each app wraps this with its own cookie name (admin:
 * `sn_srt`, storefront: `sn_rt`).
 */
export function parseSetCookie(
  setCookies: string[],
  cookieName: string,
): { value?: string; cleared: boolean } {
  const pattern = new RegExp(`^\\s*${cookieName}=([^;]*)`);
  for (const line of setCookies) {
    const match = pattern.exec(line);
    if (!match) continue;
    const value = match[1] ?? '';
    const cleared =
      value === '' || /max-age=0/i.test(line) || /expires=thu,\s*01\s*jan\s*1970/i.test(line);
    return cleared ? { cleared: true } : { value, cleared: false };
  }
  return { cleared: false };
}
