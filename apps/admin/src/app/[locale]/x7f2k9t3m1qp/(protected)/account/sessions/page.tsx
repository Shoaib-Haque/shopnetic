import { setRequestLocale } from 'next-intl/server';
import { MySessions } from '@/features/staff-sessions/components/my-sessions';

export default async function AccountSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MySessions />;
}
