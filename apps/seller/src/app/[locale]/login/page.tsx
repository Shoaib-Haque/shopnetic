import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCurrentActor } from '@/features/auth/current-actor';
import { LoginForm } from '@/features/auth/components/login-form';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getCurrentActor();
  const { returnTo } = await searchParams;

  if (actor) {
    if (returnTo && returnTo.startsWith('/')) {
      redirect(returnTo);
    }
    redirect(`/${locale}`);
  }

  return <LoginForm locale={locale} returnTo={returnTo ?? null} />;
}
