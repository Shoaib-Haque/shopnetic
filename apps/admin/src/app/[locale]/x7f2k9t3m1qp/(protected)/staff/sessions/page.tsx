import { setRequestLocale } from 'next-intl/server';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import { StaffSessions } from '@/features/staff-sessions/components/staff-sessions';

export default async function StaffSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // already fetched (and memoised) by (protected)/layout.tsx for this same
  // request — calling it again here is free, not a second round-trip.
  const staff = await getCurrentStaff();
  return <StaffSessions currentAccountId={staff?.id ?? ''} />;
}
