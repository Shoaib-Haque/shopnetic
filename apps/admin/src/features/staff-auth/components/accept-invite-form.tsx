'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { Button, Field, PasswordInput, TimerBar } from '@shopnetic/ui';
import { postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';
import { AuthPageSection } from './auth-page-section';

type FormValues = { password: string };

const REDIRECT_DELAY_MS = 3000;

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
  const router = useRouter();
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

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      router.replace(`/${locale}/${basePath}/login`);
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [done, router, locale, basePath]);

  if (!token) {
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-6">
          <h1 className="text-xl font-semibold">{t('accept.title')}</h1>
          <p className="text-sm text-destructive" role="alert">
            {t('errors.inviteInvalid')}
          </p>
        </div>
      </AuthPageSection>
    );
  }

  if (done) {
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-6">
          <h1 className="text-xl font-semibold">{t('accept.doneTitle')}</h1>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('accept.redirecting')}</p>
            <div className="overflow-hidden rounded-full bg-muted">
              <TimerBar ms={REDIRECT_DELAY_MS} className="bg-primary/60" />
            </div>
          </div>
        </div>
      </AuthPageSection>
    );
  }

  return (
    <AuthPageSection variant="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">{t('accept.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('accept.intro')}</p>
        </div>
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
      </div>
    </AuthPageSection>
  );
}
