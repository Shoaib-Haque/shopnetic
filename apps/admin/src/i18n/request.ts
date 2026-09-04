import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

type MessageModule = { default: Record<string, unknown> };

/**
 * Per-request i18n config. Namespaces split per area (plan/24 §3): `common`
 * (chrome) + `staff` (login / invite / MFA) + `catalog` (back-office catalog).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [common, staff, catalog] = (await Promise.all([
    import(`../../messages/${locale}/common.json`),
    import(`../../messages/${locale}/staff.json`),
    import(`../../messages/${locale}/catalog.json`),
  ])) as [MessageModule, MessageModule, MessageModule];

  return {
    locale,
    messages: { ...common.default, ...staff.default, ...catalog.default },
  };
});
