import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

type MessageModule = { default: Record<string, unknown> };

/**
 * Per-request i18n config. Namespaces are split per feature area
 * (plan/24-i18n-localization.md §3): `common` (chrome, errors) + `auth`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [common, auth] = (await Promise.all([
    import(`../../messages/${locale}/common.json`),
    import(`../../messages/${locale}/auth.json`),
  ])) as [MessageModule, MessageModule];

  return {
    locale,
    messages: { ...common.default, ...auth.default },
  };
});
