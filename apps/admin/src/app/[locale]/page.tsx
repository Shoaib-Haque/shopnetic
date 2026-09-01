import { notFound } from 'next/navigation';

/**
 * The admin app has no public landing. Everything lives under the obfuscated
 * base segment (`ADMIN_BASE_PATH`). Hitting the locale root just 404s.
 */
export default function AdminRoot() {
  notFound();
}
