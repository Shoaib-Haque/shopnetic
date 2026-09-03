'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { loginRequestSchema, type LoginRequest } from '@shopnetic/contracts';
import { Button, Field, Input, PasswordInput } from '@shopnetic/ui';
import { postJson } from '../submit';
import { authErrorKey, extractErrorCode } from '../error-copy';
import { ResendVerification } from './resend-verification';

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema), mode: 'onTouched' });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setSubmitting(true);
          setFormError(null);
          setNeedsVerification(false);
          const res = await postJson('/api/auth/login', values);
          setSubmitting(false);

          if (res.ok) {
            router.replace(`/${locale}`);
            router.refresh();
            return;
          }
          const code = extractErrorCode(res.body);
          if (code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
          setFormError(res.status === 0 ? t('errors.network') : t(authErrorKey(code)));
        })}
      >
        <Field
          label={t('fields.email')}
          htmlFor="login-email"
          error={errors.email ? t('fields.emailInvalid') : undefined}
        >
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field
          label={t('fields.password')}
          htmlFor="login-password"
          error={errors.password ? t('fields.passwordRequired') : undefined}
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
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

        <Button type="submit" loading={submitting} loadingText={t('login.submitting')}>
          {t('login.submit')}
        </Button>
      </form>

      {needsVerification ? (
        <div className="border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">{t('login.resendPrompt')}</p>
          <ResendVerification defaultEmail={getValues('email') ?? ''} />
        </div>
      ) : null}
    </div>
  );
}
