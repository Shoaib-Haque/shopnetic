'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SessionUser, SellerWithShop } from '@shopnetic/contracts';
import { Button, buttonVariants } from '@shopnetic/ui';
import { Store, LogOut, Settings, LayoutDashboard } from 'lucide-react';

interface SellerNavProps {
  actor: SessionUser | null;
  seller: SellerWithShop | null;
  locale: string;
}

export function SellerNav({ actor, seller, locale }: SellerNavProps) {
  const t = useTranslations('common');
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(`/${locale}/login`);
    router.refresh();
  }

  const isApproved = seller?.status === 'approved';

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 font-bold text-foreground text-lg tracking-tight"
          >
            <Store className="h-5 w-5 text-primary" />
            <span>{t('appName')}</span>
          </Link>

          {isApproved && (
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
              <Link
                href={`/${locale}/dashboard`}
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>{t('navDashboard')}</span>
              </Link>
              <Link
                href={`/${locale}/settings/shop`}
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <Settings className="h-4 w-4" />
                <span>{t('navSettings')}</span>
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {actor ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground hidden sm:inline-block font-mono">
                {actor.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                data-testid="btn-logout"
                onClick={handleLogout}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t('logout')}</span>
              </Button>
            </div>
          ) : (
            <Link
              href={`/${locale}/login`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
