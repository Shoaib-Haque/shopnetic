'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input } from '@shopnetic/ui';
import { postJson } from '../submit';

/** Always reports the same neutral result (no account enumeration). */
export function ResendVerification({ defaultEmail = '' }: { defaultEmail?: string }) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('resend.done')}
      </p>
    );
  }

  return (
    <form
      noValidate
      className="flex w-full max-w-sm flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await postJson('/api/auth/verification/resend', { email });
        setBusy(false);
        setSent(true);
      }}
    >
      <Field label={t('resend.emailLabel')} htmlFor="resend-email">
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Button type="submit" variant="outline" loading={busy} loadingText={t('resend.submitting')}>
        {t('resend.submit')}
      </Button>
    </form>
  );
}
