/** lowercase, strip accents, drop apostrophes, other punctuation → single hyphens. */
export function slugify(s: string, maxLen = 80): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

/**
 * `slugify` for a field being typed into — keeps a **trailing** hyphen so
 * "foo-bar" stays typable one key at a time. Runs on every change / paste;
 * `slugify` (which also trims the trailing `-`) runs on blur.
 */
export function slugifyLive(s: string, maxLen = 80): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, maxLen);
}
