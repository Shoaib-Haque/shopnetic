'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { staffChangePasswordRequestSchema } from '@shopnetic/contracts';
import { Button, Field, PasswordInput, TimerBar } from '@shopnetic/ui';
import { postJson } from '@/features/staff-auth/submit';
import { extractErrorCode } from '@/features/staff-auth/error-copy';

const formSchema = staffChangePasswordRequestSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'] });

type FormValues = z.infer<typeof formSchema>;

const REDIRECT_DELAY_MS = 3000;

/** Server error code → the field it belongs under — same pattern as
 * `category-form-modal.tsx`'s `FIELD_FOR_CODE`: a code that's clearly about
 * one specific input goes inline under that field (H4: "every field shows
 * its own error"), not as a generic banner above the submit button. */
const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  INVALID_CREDENTIALS: 'currentPassword',
  PASSWORD_BREACHED: 'newPassword',
};

/** Distinct from the login-context error copy: `INVALID_CREDENTIALS` here
 * means "your current password is wrong", not "email and password don't
 * match" — this form has no email field. */
function errorKeyFor(code: string | undefined): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'errors.wrongCurrentPassword';
    case 'PASSWORD_BREACHED':
      return 'errors.passwordBreached';
    case 'RATE_LIMITED':
      return 'errors.rateLimited';
    case 'VALIDATION_ERROR':
      return 'errors.validation';
    default:
      return 'errors.generic';
  }
}

export function ChangePasswordForm({ loginHref }: { loginHref: string }) {
  const t = useTranslations('staff');
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      router.replace(loginHref);
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [done, router, loginHref]);

  if (done) {
    // Sessions are being revoked (this one included, on its next refresh) —
    // leaving the sidebar/topbar visible and clickable underneath would
    // suggest the admin is still fully signed in with somewhere to go. A
    // full-screen overlay (above the sidebar's z-40 mobile drawer) blocks
    // that, matching how login/accept-invite/forgot-password's own done
    // states never show any app chrome at all — they're standalone pages.
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background px-4 pt-20 sm:pt-28">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-xl font-semibold">{t('changePassword.doneTitle')}</h1>
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('changePassword.redirecting')}</p>
            <div className="overflow-hidden rounded-full bg-muted">
              <TimerBar ms={REDIRECT_DELAY_MS} className="bg-primary/60" />
            </div>
          </div>
          <Link href={loginHref} className="mt-4 inline-block text-sm underline underline-offset-2">
            {t('changePassword.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{t('changePassword.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('changePassword.intro')}</p>
      </div>
      <form
        noValidate
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={handleSubmit(async ({ currentPassword, newPassword }) => {
          setBusy(true);
          setFormError(null);
          const res = await postJson('/api/staff-auth/change-password', {
            currentPassword,
            newPassword,
          });
          setBusy(false);
          if (res.status === 204) {
            setDone(true);
            return;
          }
          if (res.status === 0) {
            setFormError(t('errors.network'));
            return;
          }
          const code = extractErrorCode(res.body);
          const field = code ? FIELD_FOR_CODE[code] : undefined;
          if (field) {
            setError(field, { type: 'server', message: errorKeyFor(code) }, { shouldFocus: true });
          } else {
            setFormError(t(errorKeyFor(code)));
          }
        })}
      >
        <Field
          label={t('fields.currentPassword')}
          htmlFor="change-password-current"
          error={
            errors.currentPassword?.type === 'server'
              ? t(errors.currentPassword.message as string)
              : errors.currentPassword
                ? t('fields.passwordRequired')
                : undefined
          }
        >
          <PasswordInput
            id="change-password-current"
            autoComplete="current-password"
            invalid={Boolean(errors.currentPassword)}
            showLabel={t('fields.showPassword')}
            hideLabel={t('fields.hidePassword')}
            {...register('currentPassword')}
          />
        </Field>
        <Field
          label={t('fields.newPassword')}
          htmlFor="change-password-new"
          hint={t('fields.passwordHint')}
          error={
            errors.newPassword?.type === 'server'
              ? t(errors.newPassword.message as string)
              : errors.newPassword
                ? t('fields.passwordTooShort')
                : undefined
          }
        >
          <PasswordInput
            id="change-password-new"
            autoComplete="new-password"
            invalid={Boolean(errors.newPassword)}
            showLabel={t('fields.showPassword')}
            hideLabel={t('fields.hidePassword')}
            {...register('newPassword')}
          />
        </Field>
        <Field
          label={t('fields.confirmPassword')}
          htmlFor="change-password-confirm"
          error={errors.confirmPassword ? t('fields.passwordsDontMatch') : undefined}
        >
          <PasswordInput
            id="change-password-confirm"
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
        <Button type="submit" loading={busy} loadingText={t('changePassword.submitting')}>
          {t('changePassword.submit')}
        </Button>
      </form>
    </div>
  );
}
