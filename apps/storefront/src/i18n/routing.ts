import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from '@shopnetic/i18n';

/** Locale routing — every route is under `/[locale]/` (plan/24 section 2). */
export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
});
