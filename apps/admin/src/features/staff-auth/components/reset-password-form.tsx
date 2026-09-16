'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { staffResetPasswordRequestSchema } from '@shopnetic/contracts';
import { Button, Field, PasswordInput, Spinner, TimerBar } from '@shopnetic/ui';
import { getJson, postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';
import { AuthPageSection } from './auth-page-section';

const formSchema = staffResetPasswordRequestSchema
  .omit({ token: true })
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'] });

type FormValues = z.infer<typeof formSchema>;

const REDIRECT_DELAY_MS = 3000;

/** `done`/`alreadyUsed` are calm outcomes — auto-redirect, same shape, just
 * different copy. `invalid`/`expired` are real dead ends — no redirect,
 * just a way back. `checking` is the token-status request that runs before
 * the form is ever shown (`checkResetPassword` on the API), so a dead link
 * says so immediately instead of only on submit. */
type Status = 'checking' | 'form' | 'done' | 'alreadyUsed' | 'invalid' | 'expired';

function codeToStatus(code: string | undefined): Status {
  if (code === 'PASSWORD_RESET_TOKEN_ALREADY_USED') return 'alreadyUsed';
  if (code === 'PASSWORD_RESET_TOKEN_EXPIRED') return 'expired';
  return 'invalid';
}

export function ResetPasswordForm({
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
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
  });

  const loginHref = `/${locale}/${basePath}/login`;

  // Check the link's status the moment the page loads — a dead link
  // (used/expired/unknown) says so immediately instead of only once the
  // user has filled in and submitted a form that could never have worked.
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    void getJson(`/api/staff-auth/reset-password?token=${encodeURIComponent(token)}`).then(
      (res) => {
        if (cancelled) return;
        setStatus(res.status === 200 ? 'form' : codeToStatus(extractErrorCode(res.body)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status !== 'done' && status !== 'alreadyUsed') return;
    const timer = setTimeout(() => {
      router.replace(loginHref);
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router, loginHref]);

  if (status === 'checking') {
    return (
      <AuthPageSection variant="message">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('resetPassword.checking')}
        </div>
      </AuthPageSection>
    );
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">{t('resetPassword.title')}</h1>
          <p className="text-sm text-destructive" role="alert">
            {t(
              status === 'expired'
                ? 'errors.passwordResetTokenExpired'
                : 'errors.passwordResetTokenInvalid',
            )}
          </p>
          <Link href={loginHref} className="text-sm underline underline-offset-2">
            {t('resetPassword.backToLogin')}
          </Link>
        </div>
      </AuthPageSection>
    );
  }

  if (status === 'done' || status === 'alreadyUsed') {
    const title =
      status === 'done' ? t('resetPassword.doneTitle') : t('resetPassword.alreadyUsedTitle');
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="flex flex-col gap-2">
            {status === 'alreadyUsed' && (
              <p className="text-sm text-muted-foreground">{t('resetPassword.alreadyUsedIntro')}</p>
            )}
            <p className="text-sm text-muted-foreground">{t('resetPassword.redirecting')}</p>
            <div className="overflow-hidden rounded-full bg-muted">
              <TimerBar ms={REDIRECT_DELAY_MS} className="bg-primary/60" />
            </div>
          </div>
          <Link href={loginHref} className="text-sm underline underline-offset-2">
            {t('resetPassword.backToLogin')}
          </Link>
        </div>
      </AuthPageSection>
    );
  }

  return (
    <AuthPageSection variant="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">{t('resetPassword.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('resetPassword.intro')}</p>
        </div>
        <form
          noValidate
          className="flex w-full max-w-sm flex-col gap-4"
          onSubmit={handleSubmit(async ({ newPassword }) => {
            setBusy(true);
            setFormError(null);
            const res = await postJson('/api/staff-auth/reset-password', { token, newPassword });
            setBusy(false);
            if (res.status === 204) {
              setStatus('done');
              return;
            }
            const code = extractErrorCode(res.body);
            // A dead-token code discovered only now (raced past the mount
            // check — the tab sat open past expiry, or a double-submit)
            // gets the same dedicated screen the mount check would have
            // shown; anything else (breached password, validation, offline)
            // stays an inline error on this same form.
            if (
              code === 'PASSWORD_RESET_TOKEN_ALREADY_USED' ||
              code === 'PASSWORD_RESET_TOKEN_EXPIRED' ||
              code === 'PASSWORD_RESET_TOKEN_INVALID'
            ) {
              setStatus(codeToStatus(code));
              return;
            }
            setFormError(res.status === 0 ? t('errors.network') : t(staffErrorKey(code)));
          })}
        >
          <Field
            label={t('fields.newPassword')}
            htmlFor="reset-password-new"
            hint={t('fields.passwordHint')}
            error={errors.newPassword ? t('fields.passwordTooShort') : undefined}
          >
            <PasswordInput
              id="reset-password-new"
              autoComplete="new-password"
              invalid={Boolean(errors.newPassword)}
              showLabel={t('fields.showPassword')}
              hideLabel={t('fields.hidePassword')}
              {...register('newPassword')}
            />
          </Field>
          <Field
            label={t('fields.confirmPassword')}
            htmlFor="reset-password-confirm"
            error={errors.confirmPassword ? t('fields.passwordsDontMatch') : undefined}
          >
            <PasswordInput
              id="reset-password-confirm"
              autoComplete="new-password"
              invalid={Boolean(errors.confirmPassword)}
              showLabel={t('fields.showPassword')}
              hideLabel={t('fields.hidePassword')}
              {...register('confirmPassword')}
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" loading={busy} loadingText={t('resetPassword.submitting')}>
            {t('resetPassword.submit')}
          </Button>
          <Link
            href={loginHref}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('resetPassword.backToLogin')}
          </Link>
        </form>
      </div>
    </AuthPageSection>
  );
}
