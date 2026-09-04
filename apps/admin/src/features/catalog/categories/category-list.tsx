'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import { Input, notify } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { CategoryTree } from './category-tree';
import { CategoryFormModal } from './category-form-modal';
import { deleteCategory, listCategories } from './api';

type ModalState = { mode: 'create' } | { mode: 'edit'; category: Category } | null;

export function CategoryList() {
  const t = useTranslations('catalog');

  const [items, setItems] = useState<Category[] | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!items || !needle) return null;
    return items.filter(
      (c) => (c.name['en'] ?? '').toLowerCase().includes(needle) || c.slug.includes(needle),
    );
  }, [items, debouncedQ]);

  const labelOf = (c: Category | null | undefined): string => (c ? (c.name['en'] ?? c.slug) : '');

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      notify.saved(t('categories.toast.deleted', { name: labelOf(deleteTarget) }));
      setDeleteTarget(null);
      load();
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function onSaved(action: 'created' | 'updated', c: Category): void {
    notify.saved(t(`categories.toast.${action}`, { name: labelOf(c) }));
    load();
  }

  const rowActions = (c: Category) => (
    <span className="inline-flex items-center gap-1">
      <ActionButton
        icon={Pencil}
        variant="ghost"
        size="sm"
        collapseLabel
        onClick={() => setModal({ mode: 'edit', category: c })}
      >
        {t('categories.edit')}
      </ActionButton>
      <ActionButton
        icon={Trash2}
        variant="ghost"
        size="sm"
        collapseLabel
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setDeleteTarget(c)}
      >
        {t('categories.delete')}
      </ActionButton>
    </span>
  );

  return (
    <section>
      <PageHeader
        title={t('categories.title')}
        description={t('categories.subtitle')}
        actions={
          <ActionButton
            icon={Plus}
            size="sm"
            collapseLabel
            onClick={() => setModal({ mode: 'create' })}
          >
            {t('categories.new')}
          </ActionButton>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('categories.searchPlaceholder')}
          className="h-9 max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          {t('categories.showInactive')}
        </label>
      </div>

      {error !== null && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t('categories.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('categories.empty')}</p>
      ) : filtered !== null ? (
        filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('categories.noMatch')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {filtered.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{labelOf(c)}</span>{' '}
                  <span className="text-muted-foreground">/{c.slug}</span>
                </span>
                {rowActions(c)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="rounded-md border border-border">
          <CategoryTree items={items} renderActions={rowActions} />
        </div>
      )}

      {modal !== null && (
        <CategoryFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          category={modal.mode === 'edit' ? modal.category : undefined}
          allCategories={items ?? []}
          onSaved={onSaved}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={t('categories.deleteTitle')}
        message={t('categories.deleteMessage', { name: labelOf(deleteTarget) })}
        confirmLabel={t('categories.delete')}
        cancelLabel={t('categories.cancel')}
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
