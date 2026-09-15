'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { staffForgotPasswordRequestSchema } from '@shopnetic/contracts';
import { Button, Field, Input } from '@shopnetic/ui';
import { postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';
import { AuthPageSection } from './auth-page-section';

type FormValues = { email: string };

export function ForgotPasswordForm({ locale, basePath }: { locale: string; basePath: string }) {
  const t = useTranslations('staff');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(staffForgotPasswordRequestSchema),
    mode: 'onTouched',
  });

  const loginHref = `/${locale}/${basePath}/login`;

  if (done) {
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">{t('forgotPassword.doneTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('forgotPassword.doneIntro')}</p>
          <Link href={loginHref} className="text-sm underline underline-offset-2">
            {t('forgotPassword.backToLogin')}
          </Link>
        </div>
      </AuthPageSection>
    );
  }

  return (
    <AuthPageSection variant="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">{t('forgotPassword.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('forgotPassword.intro')}</p>
        </div>
        <form
          noValidate
          className="flex w-full max-w-sm flex-col gap-4"
          onSubmit={handleSubmit(async ({ email }) => {
            setBusy(true);
            setFormError(null);
            const res = await postJson('/api/staff-auth/forgot-password', { email });
            setBusy(false);
            // Always the same success state whether or not the email exists —
            // enumeration-safe (plan/16), same posture as buyer register.
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
            label={t('fields.email')}
            htmlFor="forgot-password-email"
            error={errors.email ? t('fields.emailInvalid') : undefined}
          >
            <Input
              id="forgot-password-email"
              type="email"
              autoComplete="username"
              invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" loading={busy} loadingText={t('forgotPassword.submitting')}>
            {t('forgotPassword.submit')}
          </Button>
          <Link
            href={loginHref}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('forgotPassword.backToLogin')}
          </Link>
        </form>
      </div>
    </AuthPageSection>
  );
}
