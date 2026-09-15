import 'server-only';
import { redirect } from 'next/navigation';
import { ADMIN_BASE_PATH } from '@/config/site';
import { getCurrentStaff } from './current-actor';

/**
 * Guard for public-only pages (login, accept-invite, …): a signed-in staff
 * visitor goes straight to the dashboard instead of seeing the page. Without
 * this, opening an invite link in a browser that's already signed in (the
 * common case — you sent the invite from that same browser) would silently
 * accept it and swap the browser's session cookie over to the new account,
 * since the session cookie is shared across every tab, not per-tab.
 */
export async function redirectIfSignedIn(locale: string): Promise<void> {
  if (await getCurrentStaff()) redirect(`/${locale}/${ADMIN_BASE_PATH}`);
}
