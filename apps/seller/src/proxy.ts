import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Next 16 request middleware (file is `proxy.ts`, plan/23 §2). Currently just
 * locale negotiation + redirect to `/[locale]/...`. Auth gating for the
 * (account) route group is added with Identity & Access (Phase 0).
 */
export default createMiddleware(routing);

export const config = {
  // Run on everything except api, static assets, and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
