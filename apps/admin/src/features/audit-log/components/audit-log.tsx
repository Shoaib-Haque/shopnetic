'use client';

import { Fragment, useCallback, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { AuditEvent } from '@shopnetic/contracts';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollToTopButton,
  SearchInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { listAuditEvents, type AuditDomain } from '../api';
import { diffRecords } from '../diff';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function hasDetail(event: AuditEvent): boolean {
  return event.before != null || event.after != null || event.reason != null;
}

/** A native date input only opens its picker from the small calendar-icon
 * glyph by default — everywhere else in the box just moves the text caret.
 * `showPicker()` (Chrome/Edge; a harmless no-op where unsupported, e.g.
 * Safari — falls back to the native default there) opens it from a click
 * anywhere in the field, matching how the rest of the control already
 * behaves as one clickable unit. */
function openDatePicker(e: MouseEvent<HTMLInputElement>): void {
  const el = e.currentTarget;
  if (typeof el.showPicker === 'function') el.showPicker();
}

const SELECT_CLASSNAME =
  'flex h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const DOMAINS: Array<AuditDomain | 'all'> = ['all', 'catalog', 'identity'];

// Every `targetType` any `audit.record()` call site writes today (raw,
// untranslated — matches how the Target column itself already renders
// these strings as-is rather than humanized copy).
const TARGET_TYPES = [
  'account',
  'email',
  'session',
  'session_family',
  'category',
  'brand',
  'option_type',
  'category_option',
  'product',
  'product_option',
  'variant',
  'value_set',
  'media_asset',
];

export function AuditLog() {
  const t = useTranslations('auditLog');
  const tCommon = useTranslations('admin');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [domain, setDomain] = useState<AuditDomain | 'all'>('all');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtersActive =
    q !== '' || domain !== 'all' || targetType !== '' || from !== '' || to !== '';

  function clearFilters(): void {
    setQ('');
    setDomain('all');
    setTargetType('');
    setFrom('');
    setTo('');
  }

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listAuditEvents(cursor, {
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(domain !== 'all' ? { domain } : {}),
        ...(targetType ? { targetType } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }).then((page) => ({ items: page.events, nextCursor: page.nextCursor })),
    [debouncedQ, domain, targetType, from, to],
  );

  const {
    items: events,
    loading,
    loadingMore,
    loadError,
    hasMore,
    sentinelRef,
    retry,
    loadMore,
  } = useScrollLoad<AuditEvent>(fetchPage, [debouncedQ, domain, targetType, from, to]);

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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onValueChange={setQ}
          onClear={() => setQ('')}
          clearLabel={tCommon('actions.clear')}
          placeholder={t('searchPlaceholder')}
          className="w-full max-w-xs"
        />
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('filter.title')}
            </Button>
          </PopoverTrigger>
          <PopoverContent closeLabel={tCommon('actions.close')} align="start">
            <h3 className="mb-3 pr-6 text-sm font-semibold">{t('filter.title')}</h3>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filter.domain.label')}
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value as AuditDomain | 'all')}
                  className={SELECT_CLASSNAME}
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {t(`filter.domain.${d}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filter.targetType')}
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className={SELECT_CLASSNAME}
                >
                  <option value="">{t('filter.targetTypeAll')}</option>
                  {TARGET_TYPES.map((tt) => (
                    <option key={tt} value={tt}>
                      {tt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filter.from')}
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  onClick={openDatePicker}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filter.to')}
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  onClick={openDatePicker}
                />
              </label>
            </div>
          </PopoverContent>
        </Popover>
        {filtersActive && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            {t('filter.clear')}
          </Button>
        )}
      </div>

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
          {/* desktop: full table (G7 — data tables, responsive by priority).
              Switches in at `lg`, not `md`: five `table-fixed` columns
              (Time/Actor/Action/Target/the expand chevron) need more room
              than the page's general mobile-vs-desktop breakpoint gives —
              between 768–960px they don't all fit, and because this table
              opts out of horizontal scroll (`scrollX={false}`, to keep its
              sticky header working against the page's own scroll rather
              than the table's), an overflow there gets silently clipped,
              not scrolled — Target and the chevron become invisible and
              unreachable. The card list below already handles that width
              correctly, so it just needs to keep covering it. */}
          <div className="hidden rounded-md border border-border lg:block">
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
                            <Tooltip>
                              <TooltipTrigger asChild>
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
                              </TooltipTrigger>
                              <TooltipContent>
                                {isOpen ? t('hideDetails') : t('viewDetails')}
                              </TooltipContent>
                            </Tooltip>
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
          {/* mobile + the awkward 768–960px zone the table above doesn't
              fit: one card per event — time + actor primary, action +
              target on a muted sub-line, same expand toggle as the table
              (G7). */}
          <ul className="divide-y divide-border rounded-md border border-border lg:hidden">
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
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>
                          {isOpen ? t('hideDetails') : t('viewDetails')}
                        </TooltipContent>
                      </Tooltip>
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

      <ScrollToTopButton label={tCommon('actions.backToTop')} />
    </section>
  );
}

/** `undefined` (a field only present on one side — added/removed by this
 * edit) renders as an em dash rather than the literal text "undefined". */
function renderDiffValue(v: unknown): string {
  return v === undefined ? '—' : JSON.stringify(v);
}

function AuditEventDetail({ event }: { event: AuditEvent }) {
  const t = useTranslations('auditLog');
  // A genuine update (both sides present) shows only what changed — an
  // audit log's job is "what did this person change," not "reproduce the
  // exact record" (see plan/CODING-RULES.md's dated entry on this page).
  // A create or delete (only one side present) has nothing to diff
  // *against* — every field there is the whole relevant state, not a
  // change — so it still gets the full dump.
  const isUpdate = event.before != null && event.after != null;
  const changes = isUpdate ? diffRecords(event.before, event.after) : [];

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
      {isUpdate ? (
        <div>
          <p className="mb-1 font-medium">{t('changed')}</p>
          {changes.length === 0 ? (
            <p className="text-muted-foreground">{t('noOtherChanges')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {changes.map((c) => (
                <li key={c.path} className="rounded bg-background px-2 py-1 font-mono">
                  <span className="text-foreground">{c.path}</span>
                  {': '}
                  <span className="break-words text-destructive line-through">
                    {renderDiffValue(c.before)}
                  </span>
                  {' → '}
                  <span className="break-words text-success">{renderDiffValue(c.after)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        (event.before != null || event.after != null) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {event.before != null && (
              <div>
                <p className="mb-1 font-medium">{t('before')}</p>
                <pre className="whitespace-pre-wrap break-words rounded bg-background p-2">
                  {JSON.stringify(event.before, null, 2)}
                </pre>
              </div>
            )}
            {event.after != null && (
              <div>
                <p className="mb-1 font-medium">{t('after')}</p>
                <pre className="whitespace-pre-wrap break-words rounded bg-background p-2">
                  {JSON.stringify(event.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
