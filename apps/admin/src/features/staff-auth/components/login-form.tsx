'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { staffLoginRequestSchema } from '@shopnetic/contracts';
import { Button, Field, Input, OtpInput, PasswordInput, QrCode } from '@shopnetic/ui';
import { postJson } from '../submit';
import { staffErrorKey, extractErrorCode } from '../error-copy';

type Credentials = { email: string; password: string };
type Step =
  | { name: 'password' }
  | { name: 'mfa' }
  | { name: 'enrol'; secret: string; otpauthUri: string }
  | { name: 'recovery'; codes: string[] };

export function StaffLoginForm({ locale, basePath }: { locale: string; basePath: string }) {
  const t = useTranslations('staff');
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboard = `/${locale}/${basePath}`;
  // only follow `next` back into this same admin root — never off-app
  const rawNext = searchParams.get('next');
  const destination = rawNext && rawNext.startsWith(`${dashboard}/`) ? rawNext : dashboard;

  const [step, setStep] = useState<Step>({ name: 'password' });
  const [creds, setCreds] = useState<Credentials>({ email: '', password: '' });
  const [code, setCode] = useState('');
  // the MFA step's code field doubles as the recovery-code entry (a recovery
  // code isn't 6 digits, so it can't use the segmented OtpInput)
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(staffLoginRequestSchema.pick({ email: true, password: true })),
    mode: 'onTouched',
  });

  async function attemptLogin(next: Credentials, otp?: string): Promise<void> {
    setBusy(true);
    setFormError(null);
    const res = await postJson('/api/staff-auth/login', {
      ...next,
      ...(otp ? { code: otp } : {}),
    });

    const body = res.body as {
      data?: { status?: string; secret?: string; otpauthUri?: string; user?: unknown };
    };

    // First login: not a session yet — go to the TOTP enrolment step.
    if (res.status === 200 && body.data?.status === 'totp_enrolment_required') {
      setBusy(false);
      setStep({
        name: 'enrol',
        secret: body.data.secret ?? '',
        otpauthUri: body.data.otpauthUri ?? '',
      });
      return;
    }

    // Real session (BFF returns { data: { user } } and sets the cookie). Keep
    // `busy` true through the navigation — this form unmounts when the
    // dashboard renders, and resetting it here leaves the button looking idle
    // for the beat between the response landing and the route actually changing.
    if (res.ok && body.data?.user) {
      router.replace(destination);
      router.refresh();
      return;
    }

    setBusy(false);
    const errCode = extractErrorCode(res.body);
    if (errCode === 'MFA_REQUIRED') {
      setStep({ name: 'mfa' });
      return;
    }
    setFormError(res.status === 0 ? t('errors.network') : t(staffErrorKey(errCode)));
  }

  async function confirmEnrolment(otp: string = code): Promise<void> {
    setBusy(true);
    setFormError(null);
    const res = await postJson('/api/staff-auth/totp-confirm', { ...creds, code: otp });
    setBusy(false);
    if (res.ok) {
      const codes = (res.body as { data?: { recoveryCodes?: string[] } }).data?.recoveryCodes ?? [];
      setStep({ name: 'recovery', codes });
      return;
    }
    setFormError(
      res.status === 0 ? t('errors.network') : t(staffErrorKey(extractErrorCode(res.body))),
    );
  }

  if (step.name === 'recovery') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <p className="text-sm">{t('recovery.intro')}</p>
        <ul className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 font-mono text-sm">
          {step.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t('recovery.warning')}</p>
        <Button
          loading={busy}
          loadingText={t('recovery.continuing')}
          onClick={() => {
            setBusy(true);
            router.replace(destination);
            router.refresh();
          }}
        >
          {t('recovery.continue')}
        </Button>
      </div>
    );
  }

  if (step.name === 'enrol') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <p className="text-sm">{t('enrol.intro')}</p>
        <div className="flex flex-col items-center gap-3 rounded-md border border-border p-4 text-sm">
          <QrCode value={step.otpauthUri} alt={t('enrol.qrAlt')} />
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {t('enrol.manualEntry')}
            </summary>
            <div className="mt-2">
              <div className="text-xs text-muted-foreground">{t('enrol.secretLabel')}</div>
              <code className="break-all font-mono">{step.secret}</code>
            </div>
          </details>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmEnrolment();
          }}
        >
          <Field label={t('fields.code')} htmlFor="enrol-code">
            <OtpInput
              id="enrol-code"
              value={code}
              onChange={setCode}
              onComplete={(v) => void confirmEnrolment(v)}
              invalid={Boolean(formError)}
              aria-label={t('fields.code')}
              autoFocus
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button
            type="submit"
            loading={busy}
            loadingText={t('enrol.submitting')}
            disabled={code.length !== 6}
          >
            {t('enrol.submit')}
          </Button>
        </form>
      </div>
    );
  }

  if (step.name === 'mfa') {
    const toggleRecovery = (): void => {
      setUseRecovery((v) => !v);
      setCode('');
      setFormError(null);
    };
    return (
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void attemptLogin(creds, code);
        }}
      >
        <p className="text-sm text-muted-foreground">{t('mfa.intro')}</p>
        {useRecovery ? (
          <Field label={t('fields.recoveryCode')} htmlFor="mfa-recovery">
            <Input
              id="mfa-recovery"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              invalid={Boolean(formError)}
              required
            />
          </Field>
        ) : (
          <Field label={t('fields.code')} htmlFor="mfa-code">
            <OtpInput
              id="mfa-code"
              value={code}
              onChange={setCode}
              onComplete={(v) => void attemptLogin(creds, v)}
              invalid={Boolean(formError)}
              aria-label={t('fields.code')}
              autoFocus
            />
          </Field>
        )}
        <button
          type="button"
          onClick={toggleRecovery}
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {useRecovery ? t('mfa.useAuthenticator') : t('mfa.useRecovery')}
        </button>
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button
          type="submit"
          loading={busy}
          loadingText={t('login.submitting')}
          disabled={useRecovery ? code.length < 6 : code.length !== 6}
        >
          {t('login.submit')}
        </Button>
      </form>
    );
  }

  return (
    <form
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={handleSubmit(async (values) => {
        setCreds(values);
        await attemptLogin(values);
      })}
    >
      <Field
        label={t('fields.email')}
        htmlFor="staff-email"
        error={errors.email ? t('fields.emailInvalid') : undefined}
      >
        <Input
          id="staff-email"
          type="email"
          autoComplete="username"
          invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>
      <Field
        label={t('fields.password')}
        htmlFor="staff-password"
        error={errors.password ? t('fields.passwordRequired') : undefined}
      >
        <PasswordInput
          id="staff-password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          showLabel={t('fields.showPassword')}
          hideLabel={t('fields.hidePassword')}
          {...register('password')}
        />
      </Field>
      <Link
        href={`/${locale}/${basePath}/forgot-password`}
        className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {t('login.forgotPassword')}
      </Link>
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} loadingText={t('login.submitting')}>
        {t('login.submit')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t('login.inviteHint')}{' '}
        <Link href={`/${locale}/${basePath}/accept-invite`} className="underline">
          {t('login.inviteLink')}
        </Link>
      </p>
    </form>
  );
}
