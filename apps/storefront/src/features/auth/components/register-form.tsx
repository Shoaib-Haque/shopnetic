'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { registerRequestSchema, type RegisterRequest } from '@shopnetic/contracts';
import { Button, Field, Input } from '@shopnetic/ui';
import { postJson } from '../submit';
import { authErrorKey, extractErrorCode } from '../error-copy';

export function RegisterForm() {
  const t = useTranslations('auth');
  const [submitting, setSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterRequest>({ resolver: zodResolver(registerRequestSchema), mode: 'onTouched' });

  if (submittedEmail) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('register.checkEmail', { email: submittedEmail })}
      </p>
    );
  }

  return (
    <form
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={handleSubmit(async (values) => {
        setSubmitting(true);
        setFormError(null);
        const res = await postJson('/api/auth/register', values);
        setSubmitting(false);

        if (res.status === 202) {
          setSubmittedEmail(values.email);
          return;
        }
        setFormError(
          res.status === 0 ? t('errors.network') : t(authErrorKey(extractErrorCode(res.body))),
        );
      })}
    >
      <Field
        label={t('fields.email')}
        htmlFor="register-email"
        error={errors.email ? t('fields.emailInvalid') : undefined}
      >
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>

      <Field
        label={t('fields.password')}
        htmlFor="register-password"
        hint={t('fields.passwordHint')}
        error={errors.password ? t('fields.passwordTooShort') : undefined}
      >
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" loading={submitting} loadingText={t('register.submitting')}>
        {t('register.submit')}
      </Button>
    </form>
  );
}
