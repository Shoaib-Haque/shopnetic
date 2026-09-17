'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { staffInviteAcceptRequestSchema } from '@shopnetic/contracts';
import { Button, Field, Link, PasswordInput, Spinner, TimerBar } from '@shopnetic/ui';
import { getJson, postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';
import { AuthPageSection } from './auth-page-section';

const formSchema = staffInviteAcceptRequestSchema
  .omit({ token: true })
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'] });

type FormValues = z.infer<typeof formSchema>;

const REDIRECT_DELAY_MS = 3000;

/** `done`/`alreadyAccepted` are calm outcomes — auto-redirect, same shape,
 * just different copy. `invalid`/`expired` are real dead ends — no
 * redirect, just a way back. `checking` is the token-status request that
 * runs before the form is ever shown, so a dead link says so immediately
 * instead of only on submit (same pattern as `ResetPasswordForm`). */
type Status = 'checking' | 'form' | 'done' | 'alreadyAccepted' | 'invalid' | 'expired';

function codeToStatus(code: string | undefined): Status {
  if (code === 'INVITE_ALREADY_ACCEPTED') return 'alreadyAccepted';
  if (code === 'INVITE_EXPIRED') return 'expired';
  return 'invalid';
}

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
  // (accepted/expired/unknown) says so immediately instead of only once the
  // user has filled in and submitted a form that could never have worked.
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    void getJson(`/api/staff-auth/accept-invite?token=${encodeURIComponent(token)}`).then((res) => {
      if (cancelled) return;
      setStatus(res.status === 200 ? 'form' : codeToStatus(extractErrorCode(res.body)));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status !== 'done' && status !== 'alreadyAccepted') return;
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
          {t('accept.checking')}
        </div>
      </AuthPageSection>
    );
  }

  if (status === 'invalid' || status === 'expired') {
    // No separate "Accept your staff invite" title above this — that's the
    // action this screen exists to say *isn't* available, so pairing it
    // with the error read as mismatched. The message itself is the heading.
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-destructive" role="alert">
            {t(status === 'expired' ? 'errors.inviteExpired' : 'errors.inviteInvalid')}
          </h1>
          <Link href={loginHref} className="text-sm">
            {t('accept.backToLogin')}
          </Link>
        </div>
      </AuthPageSection>
    );
  }

  if (status === 'done' || status === 'alreadyAccepted') {
    const title = status === 'done' ? t('accept.doneTitle') : t('accept.alreadyAcceptedTitle');
    return (
      <AuthPageSection variant="message">
        <div className="flex flex-col gap-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="flex flex-col gap-2">
            {status === 'alreadyAccepted' && (
              <p className="text-sm text-muted-foreground">{t('accept.alreadyAcceptedIntro')}</p>
            )}
            <p className="text-sm text-muted-foreground">{t('accept.redirecting')}</p>
            <div className="overflow-hidden rounded-full bg-muted">
              <TimerBar ms={REDIRECT_DELAY_MS} className="bg-primary/60" />
            </div>
          </div>
          <Link href={loginHref} className="text-sm">
            {t('accept.backToLogin')}
          </Link>
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
              setStatus('done');
              return;
            }
            const code = extractErrorCode(res.body);
            // A dead-token code discovered only now (raced past the mount
            // check — the tab sat open past expiry, or a double-submit)
            // gets the same dedicated screen the mount check would have
            // shown; anything else (email taken, breached password,
            // validation, offline) stays an inline error on this same form.
            if (
              code === 'INVITE_ALREADY_ACCEPTED' ||
              code === 'INVITE_EXPIRED' ||
              code === 'INVITE_INVALID'
            ) {
              setStatus(codeToStatus(code));
              return;
            }
            setFormError(res.status === 0 ? t('errors.network') : t(staffErrorKey(code)));
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
          <Field
            label={t('fields.confirmPassword')}
            htmlFor="accept-confirm-password"
            error={errors.confirmPassword ? t('fields.passwordsDontMatch') : undefined}
          >
            <PasswordInput
              id="accept-confirm-password"
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
          <Button type="submit" loading={busy} loadingText={t('accept.submitting')}>
            {t('accept.submit')}
          </Button>
          <Link href={loginHref} className="self-start text-xs">
            {t('accept.backToLogin')}
          </Link>
        </form>
      </div>
    </AuthPageSection>
  );
}
