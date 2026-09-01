/**
 * Admin app config. `ADMIN_BASE_PATH` obfuscates the panel's route segment
 * (defense in depth only — real enforcement is proxy.ts + the (protected)
 * server layout + authorize() on every action). See plan/23-project-structure.md §3.
 *
 * NOTE: the route folder `src/app/[locale]/x7f2k9t3m1qp/` must match this value.
 * Rotating it = rename the folder + update this env var per environment.
 */
export const ADMIN_BASE_PATH = process.env['ADMIN_BASE_PATH'] ?? 'x7f2k9t3m1qp';

export const COOKIE_PREFIX = process.env['COOKIE_PREFIX'] ?? 'sn_adm_';
