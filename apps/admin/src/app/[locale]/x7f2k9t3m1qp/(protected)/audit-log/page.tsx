import { setRequestLocale } from 'next-intl/server';
import { AuditLog } from '@/features/audit-log/components/audit-log';
import { ADMIN_BASE_PATH } from '@/config/site';

export default async function AuditLogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuditLog locale={locale} basePath={ADMIN_BASE_PATH} />;
}
