/**
 * Locale configuration — see plan/24-i18n-localization.md.
 * Launch is English-only, but every route is locale-scoped (`/[locale]/...`)
 * so adding a locale later is config + translation, not a refactor.
 */

export const locales = ['en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
