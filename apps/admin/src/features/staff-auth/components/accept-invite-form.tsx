'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { Button, Field, PasswordInput } from '@shopnetic/ui';
import { postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';

type FormValues = { password: string };

export function AcceptInviteForm({
  token,
  locale,
  basePath,
}: {
  token: string | null;
  locale: string;
  basePath: string;
}) {
  const t = useTranslations('staff');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(staffInviteAcceptRequestSchema.pick({ password: true })),
    mode: 'onTouched',
  });

  if (!token) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('errors.inviteInvalid')}
      </p>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">{t('accept.done')}</p>
        <Link href={`/${locale}/${basePath}/login`} className="text-sm font-medium underline">
          {t('accept.goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={handleSubmit(async ({ password }) => {
        setBusy(true);
        setFormError(null);
        const res = await postJson('/api/staff-auth/accept-invite', { token, password });
        setBusy(false);
        if (res.status === 202) {
          setDone(true);
          return;
        }
        setFormError(
          res.status === 0 ? t('errors.network') : t(staffErrorKey(extractErrorCode(res.body))),
        );
      })}
    >
      <Field
        label={t('fields.newPassword')}
        htmlFor="accept-password"
        hint={t('fields.passwordHint')}
        error={errors.password ? t('fields.passwordTooShort') : undefined}
      >
        <PasswordInput
          id="accept-password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          showLabel={t('fields.showPassword')}
          hideLabel={t('fields.hidePassword')}
          {...register('password')}
        />
      </Field>
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} loadingText={t('accept.submitting')}>
        {t('accept.submit')}
      </Button>
    </form>
  );
}
