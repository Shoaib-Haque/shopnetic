'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import type { StaffSession } from '@shopnetic/contracts';
import {
  Button,
  notify,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shopnetic/ui';
import { ActionButton } from '@/components/crud/action-button';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { ScrollLoadFooter, ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useScrollLoad, type ScrollLoadPage } from '@/components/crud/use-scroll-load';
import { AdminApiError } from '@/features/admin-api/client';
import { staffErrorKey } from '@/features/staff-auth/error-copy';
import { formatIp } from '@/lib/format';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** One bulk "log out everywhere"-style action, shown as a button above the
 * list — "log out other devices" (self) or "log out this person everywhere"
 * (admin, on someone else). */
export interface SessionListBulkAction {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
  run: () => Promise<void>;
  successMessage: string;
}

export function SessionList({
  fetchPage,
  resetKeys = [],
  showAccountEmail = false,
  onRevokeOne,
  bulkAction,
  emptyMessage,
}: {
  fetchPage: (cursor: string | undefined) => Promise<ScrollLoadPage<StaffSession>>;
  resetKeys?: readonly unknown[];
  /** The flat "All" view spans every staff member — each row needs to say
   * whose session it is. The self and per-person views don't (every row is
   * obviously the same one person). */
  showAccountEmail?: boolean;
  onRevokeOne: (session: StaffSession) => Promise<void>;
  bulkAction?: SessionListBulkAction;
  emptyMessage: string;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('admin');
  const list = useScrollLoad<StaffSession>(fetchPage, resetKeys);
  const [revokeTarget, setRevokeTarget] = useState<StaffSession | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const err = (e: unknown): void =>
    notify.error(t(staffErrorKey(e instanceof AdminApiError ? e.code : undefined)));

  async function confirmRevokeOne(): Promise<void> {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await onRevokeOne(revokeTarget);
      list.setItems((prev) => prev.filter((s) => s.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (e) {
      err(e);
    } finally {
      setRevoking(false);
    }
  }

  async function confirmBulk(): Promise<void> {
    if (!bulkAction) return;
    setBulkBusy(true);
    try {
      await bulkAction.run();
      notify.saved(bulkAction.successMessage);
      setBulkConfirming(false);
      list.refresh();
    } catch (e) {
      err(e);
    } finally {
      setBulkBusy(false);
    }
  }

  const deviceCell = (s: StaffSession): ReactNode => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium">{s.deviceLabel}</span>
        {s.isCurrent && (
          <StatusBadge tone="success" className="shrink-0">
            {t('sessions.current')}
          </StatusBadge>
        )}
      </div>
      {showAccountEmail && (
        <span className="truncate text-xs text-muted-foreground">{s.accountEmail}</span>
      )}
    </div>
  );

  const revokeButton = (s: StaffSession): ReactNode => (
    <ActionButton
      icon={LogOut}
      variant="ghost"
      size="sm"
      collapseLabel="lg"
      disabled={s.isCurrent}
      title={s.isCurrent ? t('sessions.current') : undefined}
      onClick={() => setRevokeTarget(s)}
    >
      {t('sessions.revoke')}
    </ActionButton>
  );

  // Nothing to revoke: either the list is genuinely empty, or (self-service
  // "log out other devices") the only row left is the current session
  // itself. `[].every(...)` is vacuously true, so this also covers the
  // plain-empty case for free — one condition for both contexts.
  const nothingToRevoke = list.items.every((s) => s.isCurrent);

  return (
    <div className="flex flex-col gap-3">
      {bulkAction && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={nothingToRevoke}
            onClick={() => setBulkConfirming(true)}
          >
            {bulkAction.label}
          </Button>
        </div>
      )}

      {list.loadError && list.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-6 py-10 text-sm">
          <p className="text-destructive">{tCommon('list.loadError')}</p>
          <ActionButton variant="outline" size="sm" onClick={list.retry}>
            {tCommon('list.retry')}
          </ActionButton>
        </div>
      ) : list.loading ? (
        <ScrollLoadSkeleton />
      ) : list.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className="hidden rounded-md border border-border md:block">
            <Table className="table-fixed" scrollX={false}>
              <TableHeader>
                <TableRow>
                  {/* Device has no fixed width — `table-fixed` gives it
                      whatever's left after the others, and its own `truncate`
                      (in `deviceCell`) shrinks the name with an ellipsis
                      first, rather than letting IP/Last active wrap (found
                      live: the date/time was breaking onto two lines). */}
                  <TableHead className="pl-2">{t('sessions.cols.device')}</TableHead>
                  <TableHead className="w-36 whitespace-nowrap">{t('sessions.cols.ip')}</TableHead>
                  <TableHead className="w-52 whitespace-nowrap">
                    {t('sessions.cols.lastActive')}
                  </TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((s) => (
                  <TableRow key={s.id} className="scroll-my-24">
                    <TableCell className="pl-2">{deviceCell(s)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatIp(s.ip)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatTime(s.lastUsedAt ?? s.issuedAt)}
                    </TableCell>
                    <TableCell>{revokeButton(s)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {list.items.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  {deviceCell(s)}
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatIp(s.ip)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(s.lastUsedAt ?? s.issuedAt)}
                  </p>
                </div>
                <div className="shrink-0">{revokeButton(s)}</div>
              </li>
            ))}
          </ul>

          <ScrollLoadFooter
            hasMore={list.hasMore}
            loadingMore={list.loadingMore}
            loadError={list.loadError}
            sentinelRef={list.sentinelRef}
            onRetry={list.loadMore}
          />
        </>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeTarget(null);
        }}
        tone="danger"
        title={t('sessions.confirmRevoke.title')}
        message={t('sessions.confirmRevoke.message')}
        confirmLabel={t('sessions.confirmRevoke.confirm')}
        cancelLabel={tCommon('actions.cancel')}
        loading={revoking}
        onConfirm={confirmRevokeOne}
      />

      {bulkAction && (
        <ConfirmDialog
          open={bulkConfirming}
          onOpenChange={setBulkConfirming}
          tone="danger"
          title={bulkAction.confirmTitle}
          message={bulkAction.confirmMessage}
          confirmLabel={bulkAction.confirmLabel}
          cancelLabel={tCommon('actions.cancel')}
          loading={bulkBusy}
          onConfirm={confirmBulk}
        />
      )}
    </div>
  );
}
