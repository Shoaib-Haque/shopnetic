import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shopnetic/ui'],
  // Dev-only: `next dev` 403s every `/_next/*` request whose `Origin` isn't
  // localhost, so opening the admin over the LAN (phone, another machine) loads
  // the HTML shell but none of the JS. List the hosts allowed to reach the dev
  // server. No effect on `next build` / `next start`.
  allowedDevOrigins: ['192.168.68.*'],
};

export default withNextIntl(nextConfig);
