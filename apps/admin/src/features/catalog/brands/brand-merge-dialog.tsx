'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Brand } from '@shopnetic/contracts';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  SearchInput,
  Spinner,
} from '@shopnetic/ui';
import { ScrollLoadFooter } from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { listBrandsPage, mergeBrand } from './api';

/**
 * Merge is Brand's real "remove" path (plan/25 §2.1) — its own dialog, not
 * the generic `ConfirmDialog`, since it needs a target-brand picker and
 * carries real, non-undoable consequences (unlike delete, which has a
 * one-click undo).
 */
export function BrandMergeDialog({
  open,
  onOpenChange,
  source,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Brand;
  onMerged: (target: Brand) => void;
}) {
  const t = useTranslations('catalog');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedSearch(q);
  const [target, setTarget] = useState<Brand | null>(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setTarget(null);
    setError(null);
  }, [open, source]);

  // paginated, not a hard-capped one-shot fetch (the 2026-09-18 fix) — same
  // `useScrollLoad` idiom Brand List's own table uses, just inside a short
  // scrollable picker instead of the page. `source` is filtered out of each
  // page's results rather than excluded server-side, so a page can come back
  // with fewer than `limit` rows on the rare page that contains it — no
  // different from before, when the single fetch did the same filter.
  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listBrandsPage({
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 10,
      }).then((p) => ({
        items: p.brands.filter((b) => b.id !== source.id),
        nextCursor: p.nextCursor,
      })),
    [debouncedQ, source.id],
  );
  const list = useScrollLoad<Brand>(fetchPage, [debouncedQ, source.id], open);

  async function onConfirm(): Promise<void> {
    if (!target) return;
    setMerging(true);
    setError(null);
    try {
      await mergeBrand(source.id, { intoBrandId: target.id });
      onMerged(target);
    } catch (e) {
      setError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setMerging(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !merging && onOpenChange(o)}>
      <ModalContent size="sm" closeLabel={t('brands.mergeDialog.cancel')}>
        <ModalHeader>
          <ModalTitle>{t('brands.mergeDialog.title', { name: source.name })}</ModalTitle>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('brands.mergeDialog.description', { name: source.name })}
          </p>

          <SearchInput
            value={q}
            onValueChange={setQ}
            onClear={() => setQ('')}
            clearLabel={t('brands.cancel')}
            placeholder={t('brands.mergeDialog.searchPlaceholder')}
          />

          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {list.loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner />
              </div>
            ) : list.items.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t('brands.mergeDialog.noResults')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {list.items.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setTarget(b)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                        target?.id === b.id ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      <span className="truncate">
                        {b.name}
                        <span className="ml-2 text-xs text-muted-foreground">/{b.slug}</span>
                      </span>
                    </button>
                  </li>
                ))}
                <li className="px-3 py-2">
                  <ScrollLoadFooter
                    hasMore={list.hasMore}
                    loadingMore={list.loadingMore}
                    loadError={list.loadError}
                    sentinelRef={list.sentinelRef}
                    onRetry={list.loadMore}
                  />
                </li>
              </ul>
            )}
          </div>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            {t('brands.mergeDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            loading={merging}
            disabled={!target}
            onClick={() => void onConfirm()}
          >
            {t('brands.mergeDialog.confirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
