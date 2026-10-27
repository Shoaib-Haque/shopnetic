'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { loginRequestSchema, type LoginRequest } from '@shopnetic/contracts';
import { Button, Input, PasswordInput, Field } from '@shopnetic/ui';
import { Store, AlertCircle } from 'lucide-react';

interface LoginFormProps {
  locale: string;
  returnTo?: string | null;
}

export function LoginForm({ locale, returnTo }: LoginFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    mode: 'onTouched',
  });

  async function onSubmit(values: LoginRequest) {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: values.email.trim(), password: values.password }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const code = json?.error?.code ?? 'UNAUTHENTICATED';
        setError(code === 'INVALID_CREDENTIALS' ? t('invalidCredentials') : t('loginError'));
        setIsSubmitting(false);
        return;
      }

      // Successful login
      if (returnTo && returnTo.startsWith('/')) {
        router.push(returnTo);
      } else {
        router.push(`/${locale}`);
      }
      router.refresh();
    } catch {
      setError(t('networkError'));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto py-12 px-4" data-testid="seller-login-card">
      <div className="rounded-xl border bg-card p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('loginTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('loginSubtitle')}</p>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="login-error-alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field
            label={t('emailLabel')}
            htmlFor="email"
            error={errors.email ? t('emailInvalid') : undefined}
          >
            <Input
              id="email"
              type="email"
              data-testid="input-email"
              autoComplete="email"
              placeholder="seller@example.com"
              autoFocus
              {...register('email')}
            />
          </Field>

          <Field
            label={t('passwordLabel')}
            htmlFor="password"
            error={errors.password ? t('passwordRequired') : undefined}
          >
            <PasswordInput
              id="password"
              data-testid="input-password"
              autoComplete="current-password"
              placeholder="••••••••"
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
              {...register('password')}
            />
          </Field>

          <Button
            type="submit"
            data-testid="btn-login"
            loading={isSubmitting}
            loadingText={t('signingIn')}
            className="w-full gap-2 cursor-pointer"
          >
            {t('signIn')}
          </Button>
        </form>
      </div>
    </div>
  );
}
