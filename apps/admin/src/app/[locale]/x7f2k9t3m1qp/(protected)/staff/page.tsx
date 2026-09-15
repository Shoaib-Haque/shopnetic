import { setRequestLocale } from 'next-intl/server';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';
import { StaffList } from '@/features/staff-manage/components/staff-list';

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // already fetched (and memoised) by (protected)/layout.tsx for this same
  // request — calling it again here is free, not a second round-trip.
  const staff = await getCurrentStaff();
  return <StaffList currentEmail={staff?.email ?? ''} />;
}
