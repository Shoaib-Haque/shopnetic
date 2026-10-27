import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Toaster } from '@shopnetic/ui';
import { routing } from '@/i18n/routing';
import { getSellerSession } from '@/features/seller-api/proxy-with-bearer';
import { SellerNav } from '@/features/common/seller-nav';
import { OfflineIndicator } from '@/features/common/offline-indicator';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { actor, seller } = await getSellerSession();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <NextIntlClientProvider>
          <div className="relative flex min-h-screen flex-col">
            <SellerNav actor={actor} seller={seller} locale={locale} />
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
          <OfflineIndicator />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
