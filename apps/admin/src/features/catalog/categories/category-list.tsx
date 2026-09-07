'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, CategoryListStatus } from '@shopnetic/contracts';
import { cn, Input, notify } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { matchScore, tokenize } from '@/lib/search';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { CategoryCards, CategoryFlatTable, CategoryTree, type CategoryMove } from './category-tree';
import { CategoryFormModal } from './category-form-modal';
import { deleteCategory, listCategories, reorderCategories, restoreCategory } from './api';

type ModalState = { mode: 'create' } | { mode: 'edit'; category: Category } | null;
const STATUSES: CategoryListStatus[] = ['active', 'archived', 'all'];

export function CategoryList() {
  const t = useTranslations('catalog');

  const [items, setItems] = useState<Category[] | null>(null);
  const [status, setStatus] = useState<CategoryListStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [modal, setModal] = useState<ModalState>(null);
  const [restoreTarget, setRestoreTarget] = useState<Category | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(() => {
    setError(null);
    listCategories({ status })
      .then(setItems)
      .catch((e: unknown) => {
        setItems([]);
        setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
      });
  }, [status, t]);
  useEffect(load, [load]);

  const tokens = useMemo(() => tokenize(debouncedQ), [debouncedQ]);

  const matches = useMemo(() => {
    if (!items || tokens.length === 0) return null;
    return items
      .map((c) => ({ c, score: matchScore(`${c.name['en'] ?? ''} ${c.slug}`, tokens) }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) => b.score - a.score || (a.c.name['en'] ?? '').localeCompare(b.c.name['en'] ?? ''),
      )
      .map((r) => r.c);
  }, [items, tokens]);

  const labelOf = (c: Category | null | undefined): string => (c ? (c.name['en'] ?? c.slug) : '');
  const nameOfId = (id: string | null): string => {
    if (!id) return t('categories.form.parentNone');
    return labelOf((items ?? []).find((x) => x.id === id));
  };
  const archivedDescendants = (c: Category): number =>
    (items ?? []).filter((x) => x.archivedAt != null && x.path.startsWith(`${c.path}.`)).length;

  const err = (e: unknown): void =>
    notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  // ── delete: soft (archive) + a 30s one-click undo, no confirm dialog ────────
  async function doDelete(c: Category): Promise<void> {
    try {
      await deleteCategory(c.id);
      notify.undo(t('categories.toast.deleted', { name: labelOf(c) }), {
        undoLabel: t('categories.undo'),
        undoneMessage: t('categories.toast.restored', { name: labelOf(c) }),
        onUndo: () => restoreCategory(c.id).then(load),
      });
    } catch (e) {
      err(e);
    } finally {
      load();
    }
  }

  async function confirmRestore(): Promise<void> {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreCategory(restoreTarget.id);
      notify.saved(t('categories.toast.restored', { name: labelOf(restoreTarget) }));
      setRestoreTarget(null);
      load();
    } catch (e) {
      err(e);
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }

  function onSaved(action: 'created' | 'updated', c: Category): void {
    notify.saved(t(`categories.toast.${action}`, { name: labelOf(c) }));
    load();
  }

  // ── drag reorder / reparent: apply now, offer a 30s undo, no confirm ───────
  async function applyMove(m: CategoryMove): Promise<void> {
    try {
      await reorderCategories({ parentId: m.parentId, orderedIds: m.orderedIds });
      notify.undo(
        m.reparents
          ? t('categories.toast.moved', { name: nameOfId(m.movedId) })
          : t('categories.toast.reordered'),
        {
          undoLabel: t('categories.undo'),
          undoneMessage: t('categories.toast.moveUndone'),
          onUndo: () =>
            reorderCategories({
              parentId: m.fromParentId,
              orderedIds: m.undoOrderedIds,
            }).then(load),
        },
      );
    } catch (e) {
      err(e);
    } finally {
      load();
    }
  }

  const restoreCount = restoreTarget ? archivedDescendants(restoreTarget) : 0;

  // desktop row actions (the table has room for real buttons)
  const rowActions = (c: Category) =>
    c.archivedAt != null ? (
      <ActionButton
        icon={ArchiveRestore}
        variant="ghost"
        size="sm"
        collapseLabel
        onClick={() => setRestoreTarget(c)}
      >
        {t('categories.restore')}
      </ActionButton>
    ) : (
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
          onClick={() => void doDelete(c)}
        >
          {t('categories.delete')}
        </ActionButton>
      </span>
    );

  // mobile card action — always Edit; Delete / Restore live inside the modal
  const cardAction = (c: Category) => (
    <ActionButton
      icon={Pencil}
      variant="outline"
      size="sm"
      onClick={() => setModal({ mode: 'edit', category: c })}
    >
      {t('categories.edit')}
    </ActionButton>
  );

  const flat = matches ?? items ?? [];
  const emptyMsg =
    matches !== null && matches.length === 0
      ? t('categories.noMatch')
      : (items?.length ?? 0) === 0
        ? t('categories.empty')
        : null;

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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('categories.searchPlaceholder')}
          className="h-9 max-w-xs"
        />
        <div className="inline-flex rounded-md border border-border p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded px-2.5 py-1 text-sm capitalize text-muted-foreground hover:text-foreground',
                status === s && 'bg-muted font-medium text-foreground',
              )}
            >
              {t(`categories.filter.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {error !== null && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t('categories.loading')}</p>
      ) : emptyMsg ? (
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <>
          {/* desktop: the tree (active + no search) or a flat table */}
          <div className="hidden rounded-md border border-border sm:block">
            {matches !== null ? (
              <CategoryFlatTable items={matches} renderActions={rowActions} />
            ) : status === 'active' ? (
              <CategoryTree items={items} renderActions={rowActions} onReorder={applyMove} />
            ) : (
              <CategoryFlatTable items={items} renderActions={rowActions} />
            )}
          </div>
          {/* mobile: always a flat card list, parent-then-children order */}
          <div className="rounded-md border border-border sm:hidden">
            <CategoryCards items={flat} renderAction={cardAction} />
          </div>
        </>
      )}

      {modal !== null && (
        <CategoryFormModal
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
          mode={modal.mode}
          category={modal.mode === 'edit' ? modal.category : undefined}
          allCategories={(items ?? []).filter((c) => c.archivedAt == null)}
          onSaved={onSaved}
          onDelete={(c) => void doDelete(c)}
          onRestore={setRestoreTarget}
        />
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        tone="primary"
        title={t('categories.restoreTitle')}
        message={
          restoreCount > 0
            ? t('categories.restoreMessageWithChildren', {
                name: labelOf(restoreTarget),
                count: restoreCount,
              })
            : t('categories.restoreMessage', { name: labelOf(restoreTarget) })
        }
        confirmLabel={t('categories.restore')}
        cancelLabel={t('categories.cancel')}
        loading={restoring}
        onConfirm={confirmRestore}
      />
    </section>
  );
}
