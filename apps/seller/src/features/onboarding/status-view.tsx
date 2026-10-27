'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { SellerWithShop } from '@shopnetic/contracts';
import { StatusBadge, buttonVariants } from '@shopnetic/ui';
import { Clock, XCircle, CheckCircle, ShieldAlert, Store, ArrowRight, Mail } from 'lucide-react';

interface StatusViewProps {
  seller: SellerWithShop;
  locale: string;
}

export function StatusView({ seller, locale }: StatusViewProps) {
  const t = useTranslations('onboarding');

  const formattedDate = new Date(seller.updatedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (seller.status === 'in_review') {
    return (
      <div className="w-full max-w-xl mx-auto py-12 px-4" data-testid="status-under-review-card">
        <div className="rounded-xl border bg-card p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex">
              <StatusBadge tone="warning">{t('statusInReviewBadge')}</StatusBadge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('underReviewTitle')}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t('underReviewDescription')}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-left space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('submissionDateLabel')}:</span>
              <span className="font-medium text-foreground">{formattedDate}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('shopNameLabel')}:</span>
              <span className="font-medium text-foreground">{seller.shop?.displayName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('shopSlugLabel')}:</span>
              <span className="font-mono text-xs text-foreground">{seller.shop?.slug}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('estimatedReviewLabel')}:</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {t('estimatedReviewValue')}
              </span>
            </div>
          </div>

          <div className="pt-2 text-xs text-muted-foreground">
            {t('underReviewNotificationHint')}
          </div>
        </div>
      </div>
    );
  }

  if (seller.status === 'closed') {
    return (
      <div
        className="w-full max-w-xl mx-auto py-12 px-4"
        data-testid="status-application-denied-card"
      >
        <div className="rounded-xl border border-destructive/20 bg-card p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex">
              <StatusBadge tone="danger">{t('statusDeniedBadge')}</StatusBadge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('deniedTitle')}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t('deniedDescription')}
            </p>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left text-sm text-destructive space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{t('deniedNoticeHeading')}</span>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{t('deniedNoticeBody')}</p>
          </div>

          <div className="pt-2">
            <a
              href="mailto:support@shopnetic.com"
              className={buttonVariants({ variant: 'outline', size: 'md' })}
            >
              <Mail className="h-4 w-4 mr-2" />
              <span>{t('contactSupport')}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (seller.status === 'approved') {
    return (
      <div className="w-full max-w-xl mx-auto py-12 px-4">
        <div className="rounded-xl border bg-card p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex">
              <StatusBadge tone="success">{t('statusApprovedBadge')}</StatusBadge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('approvedTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('approvedDescription', { shopName: seller.shop?.displayName ?? '' })}
            </p>
          </div>

          <Link
            href={`/${locale}/dashboard`}
            className={buttonVariants({ variant: 'primary', size: 'md' })}
          >
            <Store className="h-4 w-4 mr-2" />
            <span>{t('goToDashboard')}</span>
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </div>
      </div>
    );
  }

  // Suspended / offboarding fallback
  return (
    <div className="w-full max-w-xl mx-auto py-12 px-4">
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('suspendedTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('suspendedDescription')}</p>
        </div>
        <a
          href="mailto:compliance@shopnetic.com"
          className={buttonVariants({ variant: 'outline', size: 'md' })}
        >
          {t('contactSupport')}
        </a>
      </div>
    </div>
  );
}
