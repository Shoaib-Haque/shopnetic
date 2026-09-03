import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getCurrentStaff } from '@/features/staff-auth/current-actor';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminDashboard({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, staff] = await Promise.all([getTranslations('common'), getCurrentStaff()]);

  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t('dashboard')}</h1>
      <p className="text-sm">{staff ? `Signed in as ${staff.email}` : ''}</p>
      <p className="text-muted-foreground">{t('dashboardStub')}</p>
    </main>
  );
}
