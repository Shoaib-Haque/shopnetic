import { setRequestLocale } from 'next-intl/server';
import { ADMIN_BASE_PATH } from '@/config/site';
import { ChangePasswordForm } from '@/features/account/components/change-password-form';

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ChangePasswordForm loginHref={`/${locale}/${ADMIN_BASE_PATH}/login`} />;
}
