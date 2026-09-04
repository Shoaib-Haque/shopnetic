import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import { AdminShell } from '@/components/layout/admin-shell';

/**
 * Protected admin frame. Server Component: no valid staff session → redirect to
 * the login page (plan/23 section 3). The interactive shell (topbar / sidebar /
 * footer / toaster) lives in `AdminShell`.
 */
export default async function ProtectedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const staff = await getCurrentStaff();
  const root = `/${locale}/${ADMIN_BASE_PATH}`;
  if (!staff) redirect(`${root}/login`);

  return (
    <AdminShell email={staff.email} root={root} loginHref={`${root}/login`}>
      {children}
    </AdminShell>
  );
}
