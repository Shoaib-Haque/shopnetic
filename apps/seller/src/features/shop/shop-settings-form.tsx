'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Shop } from '@shopnetic/contracts';
import { Button, buttonVariants, Input, Field, Switch, Spinner, notify } from '@shopnetic/ui';
import { Palmtree, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface ShopSettingsFormProps {
  initialShop: Shop;
  locale: string;
}

export function ShopSettingsForm({ initialShop, locale }: ShopSettingsFormProps) {
  const t = useTranslations('shop');

  const [shop, setShop] = useState<Shop>(initialShop);
  const [displayName, setDisplayName] = useState(initialShop.displayName);
  const [description, setDescription] = useState(initialShop.description ?? '');
  const [logoUrl, setLogoUrl] = useState(initialShop.logoUrl ?? '');
  const [bannerUrl, setBannerUrl] = useState(initialShop.bannerUrl ?? '');

  // Vacation mode state
  const initialHasVacation =
    Boolean(initialShop.vacationUntil) &&
    new Date(initialShop.vacationUntil!).getTime() > Date.now();

  const [vacationEnabled, setVacationEnabled] = useState(initialHasVacation);
  const [vacationDate, setVacationDate] = useState<string>(() => {
    if (initialShop.vacationUntil) {
      return initialShop.vacationUntil.slice(0, 10);
    }
    // Default to 1 week from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isVacationActive =
    Boolean(shop.vacationUntil) && new Date(shop.vacationUntil!).getTime() > Date.now();

  async function handleReload() {
    setIsSubmitting(true);
    setConflictError(null);
    setGeneralError(null);
    try {
      const res = await fetch('/api/seller/me');
      if (res.ok) {
        const json = await res.json();
        const freshShop: Shop = json?.data?.shop;
        if (freshShop) {
          setShop(freshShop);
          setDisplayName(freshShop.displayName);
          setDescription(freshShop.description ?? '');
          setLogoUrl(freshShop.logoUrl ?? '');
          setBannerUrl(freshShop.bannerUrl ?? '');
          const hasVac =
            Boolean(freshShop.vacationUntil) &&
            new Date(freshShop.vacationUntil!).getTime() > Date.now();
          setVacationEnabled(hasVac);
          if (freshShop.vacationUntil) {
            setVacationDate(freshShop.vacationUntil.slice(0, 10));
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setConflictError(null);
    setGeneralError(null);

    let vacationUntil: string | null = null;
    if (vacationEnabled && vacationDate) {
      const dateObj = new Date(vacationDate);
      vacationUntil = dateObj.toISOString();
    }

    const payload = {
      displayName: displayName.trim(),
      description: description.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      bannerUrl: bannerUrl.trim() || undefined,
      vacationUntil,
      expectedUpdatedAt: shop.updatedAt,
    };

    try {
      const res = await fetch('/api/seller/me/shop', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        setConflictError(t('conflictErrorBody'));
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const code = json?.error?.code ?? 'INTERNAL';
        setGeneralError(`${code}: ${json?.error?.message ?? t('updateErrorGeneric')}`);
        setIsSubmitting(false);
        return;
      }

      const json = await res.json();
      const updatedShop: Shop = json?.data?.shop ?? json?.data;
      if (updatedShop) {
        setShop(updatedShop);
      }
      notify.saved(t('toastShopUpdated'));
    } catch {
      setGeneralError(t('updateErrorGeneric'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-4">
      {/* Back button */}
      <div>
        <Link
          href={`/${locale}/dashboard`}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          <span>{t('backToDashboard')}</span>
        </Link>
      </div>

      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('shopSettingsTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('shopSettingsSubtitle')}</p>
      </div>

      {/* Vacation banner if active */}
      {isVacationActive && (
        <div
          role="status"
          data-testid="vacation-active-banner"
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sky-950 dark:text-sky-200"
        >
          <div className="flex items-center gap-3">
            <Palmtree className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{t('vacationActiveTitle')}</span>{' '}
              <span>
                {t('vacationActiveMessage', {
                  date: new Date(shop.vacationUntil!).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }),
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Optimistic concurrency conflict error */}
      {conflictError && (
        <div
          role="alert"
          data-testid="conflict-alert-banner"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-semibold">{t('conflictErrorTitle')}</h3>
                <p className="text-sm opacity-90">{conflictError}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              data-testid="conflict-reload-button"
              onClick={handleReload}
              disabled={isSubmitting}
              className="gap-1 border-amber-500/30 hover:bg-amber-500/10 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{t('reload')}</span>
            </Button>
          </div>
        </div>
      )}

      {generalError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
        >
          {generalError}
        </div>
      )}

      {/* Shop Profile Form */}
      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-4">
          <Field label={t('displayNameLabel')}>
            <Input
              id="displayName"
              data-testid="input-edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </Field>

          <Field label={t('shopSlugLabel')}>
            <Input id="slug" value={shop.slug} disabled className="bg-muted font-mono text-xs" />
            <p className="mt-1 text-xs text-muted-foreground">{t('slugCannotBeChanged')}</p>
          </Field>

          <Field label={t('descriptionLabel')}>
            <textarea
              id="description"
              data-testid="textarea-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('logoUrlLabel')}>
              <Input
                id="logoUrl"
                data-testid="input-edit-logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </Field>

            <Field label={t('bannerUrlLabel')}>
              <Input
                id="bannerUrl"
                data-testid="input-edit-banner-url"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://..."
              />
            </Field>
          </div>
        </div>

        {/* Vacation Mode Section */}
        <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="vacationToggle"
                className="text-sm font-medium text-foreground flex items-center gap-2 cursor-pointer"
              >
                <Palmtree className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>{t('vacationModeLabel')}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t('vacationModeDesc')}</p>
            </div>
            <Switch
              id="vacationToggle"
              data-testid="switch-vacation-mode"
              wrappedInLabel
              checked={vacationEnabled}
              onCheckedChange={(checked) => setVacationEnabled(checked)}
            />
          </div>

          {vacationEnabled && (
            <div className="pt-2 border-t">
              <Field label={t('vacationUntilLabel')}>
                <Input
                  id="vacationUntil"
                  type="date"
                  data-testid="input-vacation-until"
                  value={vacationDate}
                  onChange={(e) => setVacationDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  required={vacationEnabled}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            data-testid="btn-save-shop-settings"
            disabled={isSubmitting || displayName.trim().length < 2}
            className="gap-2 min-w-32"
          >
            {isSubmitting ? (
              <>
                <Spinner className="size-4" />
                <span>{t('saving')}</span>
              </>
            ) : (
              <span>{t('saveChanges')}</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
