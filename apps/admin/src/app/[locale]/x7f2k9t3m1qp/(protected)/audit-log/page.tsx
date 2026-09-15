import { setRequestLocale } from 'next-intl/server';
import { AuditLog } from '@/features/audit-log/components/audit-log';

export default async function AuditLogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuditLog />;
}
