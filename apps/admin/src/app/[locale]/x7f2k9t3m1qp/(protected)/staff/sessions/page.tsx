import { setRequestLocale } from 'next-intl/server';
import { StaffSessions } from '@/features/staff-sessions/components/staff-sessions';

export default async function StaffSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaffSessions />;
}
