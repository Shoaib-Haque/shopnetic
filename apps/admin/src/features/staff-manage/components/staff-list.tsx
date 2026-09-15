'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StaffAccount, StaffRole } from '@shopnetic/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  notify,
  type StatusTone,
} from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ConfirmDialog } from '@/components/crud/confirm-dialog';
import { FormModal } from '@/components/crud/form-modal';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { AdminApiError } from '@/features/admin-api/client';
import { staffErrorKey } from '@/features/staff-auth/error-copy';
import {
  activateStaff,
  changeStaffRole,
  deprovisionStaff,
  listStaff,
  resetStaffTotp,
} from '../api';

const ROLES: StaffRole[] = ['SERVICE_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
const STATUS_TONE: Record<StaffAccount['status'], StatusTone> = {
  active: 'success',
  locked: 'warning',
  disabled: 'danger',
  anonymized: 'neutral',
};
const selectCls = 'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm';

/** G7: interpolated into a fixed-width dialog/toast — cap before embedding,
 * not after, so a long address wraps the sentence instead of the sentence
 * growing to fit it. The row's own cell still shows the full value (truncated
 * with a `title=` tooltip), so nothing is actually lost. */
function capForMessage(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** A confirm-style action (activate / reset-totp / deprovision) — same shape,
 * different copy + call, so one piece of state and one dialog covers all
 * three. "activate" covers both unlock (from `locked`) and reactivate (from
 * `disabled`) — `account.status`, captured when the menu was opened, decides
 * which copy to show. */
type PendingConfirm = { kind: 'activate' | 'resetTotp' | 'deprovision'; account: StaffAccount };

export function StaffList({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('admin');
  const [roleTarget, setRoleTarget] = useState<StaffAccount | null>(null);
  const [roleChoice, setRoleChoice] = useState<StaffRole>('ADMIN');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    items: accounts,
    setItems: setAccounts,
    loading,
    loadingMore,
    loadError,
    hasMore,
    sentinelRef,
    retry,
    loadMore,
  } = useScrollLoad<StaffAccount>((cursor) =>
    listStaff(cursor).then((page) => ({ items: page.accounts, nextCursor: page.nextCursor })),
  );

  function applyUpdate(updated: StaffAccount): void {
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  function reportError(err: unknown): void {
    const code = err instanceof AdminApiError ? err.code : undefined;
    notify.error(t(staffErrorKey(code)));
  }

  async function submitRoleChange(): Promise<void> {
    if (!roleTarget) return;
    setBusy(true);
    try {
      const updated = await changeStaffRole(roleTarget.id, roleChoice);
      applyUpdate(updated);
      notify.saved(t('manage.toast.roleChanged', { email: capForMessage(roleTarget.email) }));
      setRoleTarget(null);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm(): Promise<void> {
    if (!pendingConfirm) return;
    const { kind, account } = pendingConfirm;
    setBusy(true);
    try {
      const updated = await (kind === 'activate'
        ? activateStaff(account.id)
        : kind === 'resetTotp'
          ? resetStaffTotp(account.id)
          : deprovisionStaff(account.id));
      applyUpdate(updated);
      const toastKey =
        kind === 'activate'
          ? account.status === 'disabled'
            ? 'reactivated'
            : 'unlocked'
          : kind === 'resetTotp'
            ? 'totpReset'
            : 'deprovisioned';
      notify.saved(t(`manage.toast.${toastKey}`, { email: capForMessage(account.email) }));
      setPendingConfirm(null);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  function renderMenu(account: StaffAccount): ReactNode {
    const isSelf = account.email === currentEmail;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={tCommon('actions.more')}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={isSelf}
            onSelect={() => {
              setRoleTarget(account);
              setRoleChoice(account.roles[0] ?? 'ADMIN');
            }}
          >
            {t('manage.actions.changeRole')}
          </DropdownMenuItem>
          {(account.status === 'locked' || account.status === 'disabled') && (
            <DropdownMenuItem onSelect={() => setPendingConfirm({ kind: 'activate', account })}>
              {t(
                account.status === 'disabled'
                  ? 'manage.actions.reactivate'
                  : 'manage.actions.unlock',
              )}
            </DropdownMenuItem>
          )}
          {account.totpEnrolled && (
            <DropdownMenuItem onSelect={() => setPendingConfirm({ kind: 'resetTotp', account })}>
              {t('manage.actions.resetTotp')}
            </DropdownMenuItem>
          )}
          {account.status !== 'disabled' && (
            <DropdownMenuItem
              disabled={isSelf}
              onSelect={() => setPendingConfirm({ kind: 'deprovision', account })}
            >
              {t('manage.actions.deprovision')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function confirmCopyFor(confirm: PendingConfirm): {
    title: string;
    message: string;
    confirm: string;
  } {
    const email = capForMessage(confirm.account.email);
    switch (confirm.kind) {
      case 'activate':
        return confirm.account.status === 'disabled'
          ? {
              title: t('manage.confirmReactivate.title'),
              message: t('manage.confirmReactivate.message', { email }),
              confirm: t('manage.confirmReactivate.confirm'),
            }
          : {
              title: t('manage.confirmUnlock.title'),
              message: t('manage.confirmUnlock.message', { email }),
              confirm: t('manage.confirmUnlock.confirm'),
            };
      case 'resetTotp':
        return {
          title: t('manage.confirmResetTotp.title'),
          message: t('manage.confirmResetTotp.message', { email }),
          confirm: t('manage.confirmResetTotp.confirm'),
        };
      case 'deprovision':
        return {
          title: t('manage.confirmDeprovision.title'),
          message: t('manage.confirmDeprovision.message', { email }),
          confirm: t('manage.confirmDeprovision.confirm'),
        };
    }
  }

  return (
    <section className="mb-8">
      <PageHeader title={t('manage.title')} description={t('manage.intro')} />

      {loadError && accounts.length === 0 ? (
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
      ) : (
        <>
          {/* desktop: full table (G7 — data tables, responsive by priority) */}
          <div className="hidden rounded-md border border-border md:block">
            <Table className="table-fixed" scrollX={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('manage.cols.email')}</TableHead>
                  <TableHead className="w-36">{t('manage.cols.role')}</TableHead>
                  <TableHead className="w-28">{t('manage.cols.status')}</TableHead>
                  <TableHead className="w-36">{t('manage.cols.totp')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isSelf = account.email === currentEmail;
                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate" title={account.email}>
                            {account.email}
                          </span>
                          {isSelf && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t('manage.you')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="truncate">
                        {account.roles.map((role) => t(`invite.roles.${role}`)).join(', ')}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONE[account.status]}>
                          {t(`manage.status.${account.status}`)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="truncate">
                        {account.totpEnrolled
                          ? t('manage.totpEnrolled')
                          : t('manage.totpNotEnrolled')}
                      </TableCell>
                      <TableCell>{renderMenu(account)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* mobile: one card per account — label + secondary fields on a
              muted sub-line + the same menu as the primary action (G7). */}
          <ul className="divide-y divide-border rounded-md border border-border md:hidden">
            {accounts.map((account) => {
              const isSelf = account.email === currentEmail;
              return (
                <li key={account.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-medium" title={account.email}>
                        {account.email}
                      </span>
                      {isSelf && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t('manage.you')}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span>
                        {account.roles.map((role) => t(`invite.roles.${role}`)).join(', ')}
                      </span>
                      <span aria-hidden>·</span>
                      <StatusBadge tone={STATUS_TONE[account.status]}>
                        {t(`manage.status.${account.status}`)}
                      </StatusBadge>
                      <span aria-hidden>·</span>
                      <span>
                        {account.totpEnrolled
                          ? t('manage.totpEnrolled')
                          : t('manage.totpNotEnrolled')}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0">{renderMenu(account)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!loading && accounts.length > 0 && (
        <>
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

      <FormModal
        open={roleTarget !== null}
        onOpenChange={(open) => !open && setRoleTarget(null)}
        title={t('manage.roleModal.title')}
        description={
          roleTarget
            ? t('manage.roleModal.description', { email: capForMessage(roleTarget.email) })
            : ''
        }
        submitLabel={t('manage.roleModal.submit')}
        submitting={busy}
        onSubmit={(e) => {
          e.preventDefault();
          void submitRoleChange();
        }}
      >
        <Field label={t('manage.cols.role')} htmlFor="staff-role-choice">
          <select
            id="staff-role-choice"
            className={selectCls}
            value={roleChoice}
            onChange={(e) => setRoleChoice(e.target.value as StaffRole)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`invite.roles.${role}`)}
              </option>
            ))}
          </select>
        </Field>
      </FormModal>

      {pendingConfirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingConfirm(null)}
          title={confirmCopyFor(pendingConfirm).title}
          message={confirmCopyFor(pendingConfirm).message}
          confirmLabel={confirmCopyFor(pendingConfirm).confirm}
          cancelLabel={tCommon('actions.cancel')}
          onConfirm={() => void runConfirm()}
          loading={busy}
          tone={pendingConfirm.kind === 'deprovision' ? 'danger' : 'primary'}
        />
      )}
    </section>
  );
}
