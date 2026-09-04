'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import { buttonVariants } from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { deleteCategory, listCategories } from './api';

export function CategoryList({ locale, basePath }: { locale: string; basePath: string }) {
  const t = useTranslations('catalog');
  const base = `/${locale}/${basePath}/catalog/categories`;

  const [items, setItems] = useState<Category[] | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listCategories({ includeInactive })
      .then(setItems)
      .catch((e: unknown) => {
        setItems([]);
        setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      });
  }, [includeInactive, t]);

  useEffect(load, [load]);

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteCategory(id);
      setPendingDelete(null);
      load();
    } catch (e) {
      setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('categories.title')}</h1>
        <Link href={`${base}/new`} className={buttonVariants({ size: 'sm' })}>
          {t('categories.new')}
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        {t('categories.showInactive')}
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t('categories.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('categories.empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1" style={{ paddingLeft: `${(c.depth - 1) * 16}px` }}>
                <span className="font-medium">{c.name['en'] ?? c.slug}</span>{' '}
                <span className="text-muted-foreground">/{c.slug}</span>
                {!c.isActive && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {t('categories.inactive')}
                  </span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {t(`categories.brandReq.${c.brandRequirement}`)}
                </span>
              </span>

              <Link href={`${base}/${c.id}`} className="text-xs font-medium underline">
                {t('categories.edit')}
              </Link>

              {pendingDelete === c.id ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onDelete(c.id)}
                    className="text-xs font-medium text-destructive underline"
                  >
                    {t('categories.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="text-xs text-muted-foreground underline"
                  >
                    {t('categories.cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDelete(c.id)}
                  className="text-xs text-muted-foreground underline hover:text-destructive"
                >
                  {t('categories.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
