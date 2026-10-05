'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import type { StaffAccount } from '@shopnetic/contracts';
import { cn, SearchInput } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { ScrollLoadFooter, ScrollLoadSkeleton } from '@/components/crud/scroll-load-states';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { listStaff } from '@/features/staff-manage/api';
import { SessionList } from './session-list';
import {
  listAccountSessions,
  listAllSessions,
  listMySessions,
  revokeAccountSession,
  revokeAllAccountSessions,
  revokeMyOtherSessions,
  revokeMySession,
} from '../api';

type Tab = 'all' | 'byPerson';

export function StaffSessions({ currentAccountId }: { currentAccountId: string }) {
  const t = useTranslations('staff');
  const [tab, setTab] = useState<Tab>('all');

  return (
    <section>
      <PageHeader title={t('sessions.allTitle')} description={t('sessions.allIntro')} />
      <div className="mb-3 inline-flex rounded-md border border-border p-0.5">
        {(['all', 'byPerson'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'rounded px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground',
              tab === tb && 'bg-muted font-medium text-foreground',
            )}
          >
            {t(`sessions.tabs.${tb}`)}
          </button>
        ))}
      </div>
      {tab === 'all' ? (
        <AllSessionsTab currentAccountId={currentAccountId} />
      ) : (
        <ByPersonTab currentAccountId={currentAccountId} />
      )}
    </section>
  );
}

function AllSessionsTab({ currentAccountId }: { currentAccountId: string }) {
  const t = useTranslations('staff');
  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listAllSessions({
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.sessions, nextCursor: p.nextCursor })),
    [],
  );
  return (
    <SessionList
      fetchPage={fetchPage}
      showAccountEmail
      // This flat list spans every staff account, including the viewer's
      // own — found live: their own row always failed with
      // `CANNOT_MODIFY_SELF` through the admin-only endpoint, same bug
      // class as `PersonSessionList`'s own-row case above.
      onRevokeOne={(s) =>
        s.accountId === currentAccountId
          ? revokeMySession(s.id)
          : revokeAccountSession(s.accountId, s.id)
      }
      emptyMessage={t('sessions.allEmpty')}
    />
  );
}

function ByPersonTab({ currentAccountId }: { currentAccountId: string }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('admin');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedSearch(q);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listStaff({
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      }).then((p) => ({ items: p.accounts, nextCursor: p.nextCursor })),
    [debouncedQ],
  );
  const list = useScrollLoad<StaffAccount>(fetchPage, [debouncedQ]);

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={q}
        onValueChange={setQ}
        onClear={() => setQ('')}
        clearLabel={tCommon('actions.clear')}
        placeholder={t('manage.searchPlaceholder')}
        className="w-full max-w-xs"
      />

      {list.loadError && list.items.length === 0 ? (
        <p className="text-sm text-destructive">{tCommon('list.loadError')}</p>
      ) : list.loading ? (
        <ScrollLoadSkeleton />
      ) : list.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('manage.empty')}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.items.map((account) => {
              const isOpen = expandedId === account.id;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : account.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 truncate font-medium">{account.email}</span>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out',
                        isOpen && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                  {isOpen && (
                    <div className="max-h-96 overflow-y-auto border-t border-border px-3 py-3">
                      <PersonSessionList
                        accountId={account.id}
                        accountEmail={account.email}
                        isSelf={account.id === currentAccountId}
                      />
                    </div>
                  )}
                </li>
              );
            })}
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
    </div>
  );
}

function PersonSessionList({
  accountId,
  accountEmail,
  isSelf,
}: {
  accountId: string;
  accountEmail: string;
  // The admin-on-other-account endpoints (`revokeAccountSession` /
  // `revokeAllAccountSessions`) reject a caller acting on their own account
  // (`CANNOT_MODIFY_SELF` — see `StaffAccountsService.assertNotSelf`), and
  // that account still shows up here since the staff directory lists every
  // account, including the viewer's own. Found live: expanding your own row
  // rendered a working-looking "Log out" button that always failed. Routing
  // this one row through the self-service endpoints instead (same as
  // `MySessions`) makes it actually work rather than merely disabling it.
  isSelf: boolean;
}) {
  const t = useTranslations('staff');
  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      (isSelf ? listMySessions(cursor, 20) : listAccountSessions(accountId, cursor, 20)).then(
        (p) => ({ items: p.sessions, nextCursor: p.nextCursor }),
      ),
    [accountId, isSelf],
  );
  if (isSelf) {
    return (
      <SessionList
        fetchPage={fetchPage}
        resetKeys={[accountId]}
        onRevokeOne={(s) => revokeMySession(s.id)}
        bulkAction={{
          label: t('sessions.revokeOthers'),
          confirmTitle: t('sessions.confirmRevokeOthers.title'),
          confirmMessage: t('sessions.confirmRevokeOthers.message'),
          confirmLabel: t('sessions.confirmRevokeOthers.confirm'),
          run: () => revokeMyOtherSessions(),
          successMessage: t('sessions.toast.revokedOthers'),
        }}
        emptyMessage={t('sessions.empty')}
      />
    );
  }
  return (
    <SessionList
      fetchPage={fetchPage}
      resetKeys={[accountId]}
      onRevokeOne={(s) => revokeAccountSession(accountId, s.id)}
      bulkAction={{
        label: t('sessions.revokeAllFor'),
        confirmTitle: t('sessions.confirmRevokeAllForAccount.title', { email: accountEmail }),
        confirmMessage: t('sessions.confirmRevokeAllForAccount.message', { email: accountEmail }),
        confirmLabel: t('sessions.confirmRevokeAllForAccount.confirm'),
        run: () => revokeAllAccountSessions(accountId),
        successMessage: t('sessions.toast.revokedAllForAccount', { email: accountEmail }),
      }}
      emptyMessage={t('sessions.empty')}
    />
  );
}
