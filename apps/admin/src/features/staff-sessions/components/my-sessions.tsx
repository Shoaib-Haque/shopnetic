'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SessionList } from './session-list';
import { listMySessions, revokeMyOtherSessions, revokeMySession } from '../api';

export function MySessions() {
  const t = useTranslations('staff');

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listMySessions(cursor, 30).then((p) => ({ items: p.sessions, nextCursor: p.nextCursor })),
    [],
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('sessions.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('sessions.intro')}</p>
      </div>
      <SessionList
        fetchPage={fetchPage}
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
    </section>
  );
}
