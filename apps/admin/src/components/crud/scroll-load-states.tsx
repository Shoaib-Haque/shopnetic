'use client';

import { useTranslations } from 'next-intl';
import { Button, Skeleton, Spinner } from '@shopnetic/ui';

/**
 * Three pieces every `useScrollLoad`-backed list ended up hand-rolling the
 * same way (Audit Log, Staff List — and Category List's own flat/paginated
 * view for the footer specifically; Category's *top-level* error/skeleton
 * differ genuinely enough — its own custom tree-shaped skeleton, a dual
 * tree/flat mode — to stay hand-rolled rather than forced into a shared
 * shape that doesn't fit). All three read `admin.list.*` directly, matching
 * every existing call site's `tCommon('list.*')` — nothing to pass in.
 */

/** The *first*-page load failed with nothing on screen yet — a retry, not
 * an empty state (CODING-RULES E5: error renders instead of empty, never
 * stacked on it). */
export function ScrollLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('admin');
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <p className="text-destructive">{t('list.loadError')}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('list.retry')}
      </Button>
    </div>
  );
}

/** Generic first-load placeholder — three bars, no per-entity shape. A list
 * whose rows have a distinctive shape worth echoing (Category List's tree)
 * uses its own skeleton instead of this one. */
export function ScrollLoadSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** The "load more" footer: the `IntersectionObserver` sentinel (only
 * rendered while there's a next page to fetch), a *later*-page load
 * indicator/retry (the rows already on screen stay put — only a first-page
 * failure is a whole-page error), and "no more items" once exhausted. */
export function ScrollLoadFooter({
  hasMore,
  loadingMore,
  loadError,
  sentinelRef,
  onRetry,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  sentinelRef: (node: HTMLElement | null) => void;
  onRetry: () => void;
}) {
  const t = useTranslations('admin');
  return (
    <>
      {hasMore && (
        <div ref={sentinelRef} className="h-px" aria-hidden data-testid="scroll-sentinel" />
      )}
      <div className="mt-3">
        {loadingMore && !loadError && (
          // centered, not left-aligned — same "something's loading" idiom
          // the auth forms already use (Spinner + text), not a one-off
          // text-only line; centering keeps it where the eye already is
          // right after scrolling to the bottom (E4: spinners for actions,
          // this is the "loading more" action, not a first load).
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            {t('list.loading')}
          </div>
        )}
        {loadError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">{t('list.loadError')}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('list.retry')}
            </Button>
          </div>
        )}
        {!hasMore && !loadError && (
          <p className="text-xs text-muted-foreground">{t('list.noMore')}</p>
        )}
      </div>
    </>
  );
}
