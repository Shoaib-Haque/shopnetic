'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { SellerWithShop } from '@shopnetic/contracts';
import { StatusBadge, buttonVariants } from '@shopnetic/ui';
import {
  Store,
  Settings,
  Package,
  ShoppingBag,
  TrendingUp,
  Palmtree,
  ExternalLink,
} from 'lucide-react';

interface DashboardViewProps {
  seller: SellerWithShop;
  locale: string;
}

export function DashboardView({ seller, locale }: DashboardViewProps) {
  const t = useTranslations('shop');
  const shop = seller.shop;

  const isVacationActive =
    shop?.vacationUntil && new Date(shop.vacationUntil).getTime() > Date.now();

  const vacationFormatted = shop?.vacationUntil
    ? new Date(shop.vacationUntil).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="space-y-8" data-testid="seller-dashboard">
      {/* Top Welcome Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {shop?.displayName ?? seller.legalName}
            </h1>
            <StatusBadge tone="success">{t('statusApproved')}</StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('sellerId')}: <span className="font-mono text-xs">{seller.id}</span> •{' '}
            {t('shopSlug')}: <span className="font-mono text-xs">{shop?.slug}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/settings/shop`}
            data-testid="link-shop-settings"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Settings className="h-4 w-4 mr-2" />
            <span>{t('shopSettings')}</span>
          </Link>
        </div>
      </div>

      {/* Vacation Mode Banner if active */}
      {isVacationActive && (
        <div
          role="status"
          data-testid="vacation-mode-banner"
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sky-950 dark:text-sky-200"
        >
          <div className="flex items-center gap-3">
            <Palmtree className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{t('vacationBannerTitle')}</span>{' '}
              <span>{t('vacationBannerBody', { date: vacationFormatted ?? '' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-sm font-medium">
            <span>{t('metricOrders')}</span>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">0</div>
          <p className="text-xs text-muted-foreground">{t('metricOrdersHint')}</p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-sm font-medium">
            <span>{t('metricListings')}</span>
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">0</div>
          <p className="text-xs text-muted-foreground">{t('metricListingsHint')}</p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-sm font-medium">
            <span>{t('metricRevenue')}</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">$0.00</div>
          <p className="text-xs text-muted-foreground">{t('metricRevenueHint')}</p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-sm font-medium">
            <span>{t('metricStanding')}</span>
            <Store className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {t('metricStandingGood')}
          </div>
          <p className="text-xs text-muted-foreground">{t('metricStandingHint')}</p>
        </div>
      </div>

      {/* Quick Launchpad */}
      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('quickActionsTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href={`/${locale}/settings/shop`}
            className="group block rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            <div className="flex items-center justify-between font-medium text-foreground group-hover:text-primary">
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                {t('manageShopProfile')}
              </span>
              <ExternalLink className="h-4 w-4 opacity-50 group-hover:opacity-100" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('manageShopProfileDesc')}</p>
          </Link>

          <div className="block rounded-lg border border-dashed p-4 opacity-70">
            <div className="font-medium text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>{t('catalogOffers')}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Phase 2
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('catalogOffersDesc')}</p>
          </div>

          <div className="block rounded-lg border border-dashed p-4 opacity-70">
            <div className="font-medium text-foreground flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              <span>{t('orderFulfillment')}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Phase 2
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('orderFulfillmentDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
