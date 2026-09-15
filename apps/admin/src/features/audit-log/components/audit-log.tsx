'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import type { AuditEvent } from '@shopnetic/contracts';
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { listAuditEvents } from '../api';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function hasDetail(event: AuditEvent): boolean {
  return event.before != null || event.after != null || event.reason != null;
}

export function AuditLog() {
  const t = useTranslations('auditLog');
  const tCommon = useTranslations('admin');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const {
    items: events,
    loading,
    loadingMore,
    loadError,
    hasMore,
    sentinelRef,
    retry,
    loadMore,
  } = useScrollLoad<AuditEvent>((cursor) =>
    listAuditEvents(cursor).then((page) => ({ items: page.events, nextCursor: page.nextCursor })),
  );

  function toggleExpanded(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="mb-8">
      <PageHeader title={t('title')} description={t('intro')} />

      {loadError && events.length === 0 ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="text-destructive">{tCommon('list.loadError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            {tCommon('list.retry')}
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          {/* desktop: full table (G7 — data tables, responsive by priority) */}
          <div className="hidden rounded-md border border-border md:block">
            <Table className="table-fixed" scrollX={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t('cols.time')}</TableHead>
                  <TableHead className="w-52">{t('cols.actor')}</TableHead>
                  <TableHead className="w-52">{t('cols.action')}</TableHead>
                  <TableHead>{t('cols.target')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const isOpen = expanded.has(event.id);
                  const expandable = hasDetail(event);
                  return (
                    <Fragment key={event.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTime(event.createdAt)}
                        </TableCell>
                        <TableCell className="truncate" title={event.actorEmail ?? undefined}>
                          {event.actorEmail ?? t('system')}
                        </TableCell>
                        <TableCell className="truncate font-mono text-xs" title={event.action}>
                          {event.action}
                        </TableCell>
                        <TableCell className="truncate text-xs text-muted-foreground">
                          {event.targetType
                            ? `${event.targetType}${event.targetId ? `:${event.targetId}` : ''}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {expandable && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(event.id)}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? t('hideDetails') : t('viewDetails')}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ChevronDown
                                className={cn(
                                  'size-4 transition-transform',
                                  isOpen && 'rotate-180',
                                )}
                                aria-hidden
                              />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30">
                            <AuditEventDetail event={event} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* mobile: one card per event — time + actor primary, action +
              target on a muted sub-line, same expand toggle as the table
              (G7). */}
          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {events.map((event) => {
              const isOpen = expanded.has(event.id);
              const expandable = hasDetail(event);
              return (
                <li key={event.id} className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span
                          className="truncate font-medium"
                          title={event.actorEmail ?? undefined}
                        >
                          {event.actorEmail ?? t('system')}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(event.createdAt)}
                        </span>
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                        title={event.action}
                      >
                        {event.action}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {event.targetType
                          ? `${event.targetType}${event.targetId ? `:${event.targetId}` : ''}`
                          : '—'}
                      </p>
                    </div>
                    {expandable && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(event.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? t('hideDetails') : t('viewDetails')}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronDown
                          className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-2 rounded bg-muted/30 px-2">
                      <AuditEventDetail event={event} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* the sentinel is invisible plumbing (1px), not a "load more"
              control — scrolling it into view (or it simply starting out
              visible, when this page didn't fill the viewport) is what
              triggers the next page */}
          {hasMore && (
            <div ref={sentinelRef} className="h-px" aria-hidden data-testid="scroll-sentinel" />
          )}

          <div className="mt-3">
            {loadingMore && !loadError && (
              <p className="text-xs text-muted-foreground">{tCommon('list.loading')}</p>
            )}
            {loadError && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-destructive">{tCommon('list.loadError')}</p>
                <Button type="button" variant="outline" size="sm" onClick={loadMore}>
                  {tCommon('list.retry')}
                </Button>
              </div>
            )}
            {!hasMore && !loadError && (
              <p className="text-xs text-muted-foreground">{tCommon('list.noMore')}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function AuditEventDetail({ event }: { event: AuditEvent }) {
  const t = useTranslations('auditLog');
  return (
    <div className="flex flex-col gap-2 py-2 text-xs">
      {event.reason && (
        <p>
          <span className="font-medium">{t('reason')}:</span> {event.reason}
        </p>
      )}
      {(event.ip ?? event.correlationId) && (
        <p className="text-muted-foreground">
          {event.ip && `IP: ${event.ip}`}
          {event.ip && event.correlationId && ' · '}
          {event.correlationId && `${t('correlationId')}: ${event.correlationId}`}
        </p>
      )}
      {(event.before != null || event.after != null) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {event.before != null && (
            <div>
              <p className="mb-1 font-medium">{t('before')}</p>
              <pre className="overflow-x-auto rounded bg-background p-2">
                {JSON.stringify(event.before, null, 2)}
              </pre>
            </div>
          )}
          {event.after != null && (
            <div>
              <p className="mb-1 font-medium">{t('after')}</p>
              <pre className="overflow-x-auto rounded bg-background p-2">
                {JSON.stringify(event.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
