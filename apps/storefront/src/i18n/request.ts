import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

/**
 * Per-request i18n config. Loads only the namespaces a route needs; the skeleton
 * has one file (`common.json`). See plan/24-i18n-localization.md §3.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const common = (await import(`../../messages/${locale}/common.json`)) as {
    default: Record<string, unknown>;
  };

  return {
    locale,
    messages: common.default,
  };
});
