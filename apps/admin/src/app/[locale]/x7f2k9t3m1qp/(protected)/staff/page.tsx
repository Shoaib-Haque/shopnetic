import { setRequestLocale } from 'next-intl/server';
import { InviteStaffForm } from '@/features/staff-manage/components/invite-staff-form';

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InviteStaffForm />;
}
