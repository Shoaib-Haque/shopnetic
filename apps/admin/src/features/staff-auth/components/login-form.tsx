'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { staffLoginRequestSchema } from '@shopnetic/contracts';
import { Button, Field, Input } from '@shopnetic/ui';
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
  const dashboard = `/${locale}/${basePath}`;

  const [step, setStep] = useState<Step>({ name: 'password' });
  const [creds, setCreds] = useState<Credentials>({ email: '', password: '' });
  const [code, setCode] = useState('');
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
    setBusy(false);

    const body = res.body as {
      data?: { status?: string; secret?: string; otpauthUri?: string; user?: unknown };
    };

    // First login: not a session yet — go to the TOTP enrolment step.
    if (res.status === 200 && body.data?.status === 'totp_enrolment_required') {
      setStep({
        name: 'enrol',
        secret: body.data.secret ?? '',
        otpauthUri: body.data.otpauthUri ?? '',
      });
      return;
    }

    // Real session (BFF returns { data: { user } } and sets the cookie).
    if (res.ok && body.data?.user) {
      router.replace(dashboard);
      router.refresh();
      return;
    }

    const errCode = extractErrorCode(res.body);
    if (errCode === 'MFA_REQUIRED') {
      setStep({ name: 'mfa' });
      return;
    }
    setFormError(res.status === 0 ? t('errors.network') : t(staffErrorKey(errCode)));
  }

  async function confirmEnrolment(): Promise<void> {
    setBusy(true);
    setFormError(null);
    const res = await postJson('/api/staff-auth/totp-confirm', { ...creds, code });
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
          onClick={() => {
            router.replace(dashboard);
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
        <div className="rounded-md border border-border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{t('enrol.secretLabel')}</div>
          <code className="break-all font-mono">{step.secret}</code>
          <div className="mt-2 text-xs text-muted-foreground">{t('enrol.uriLabel')}</div>
          <code className="break-all text-xs">{step.otpauthUri}</code>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmEnrolment();
          }}
        >
          <Field label={t('fields.code')} htmlFor="enrol-code">
            <Input
              id="enrol-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" loading={busy} loadingText={t('enrol.submitting')}>
            {t('enrol.submit')}
          </Button>
        </form>
      </div>
    );
  }

  if (step.name === 'mfa') {
    return (
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void attemptLogin(creds, code);
        }}
      >
        <p className="text-sm text-muted-foreground">{t('mfa.intro')}</p>
        <Field label={t('fields.code')} htmlFor="mfa-code">
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </Field>
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" loading={busy} loadingText={t('login.submitting')}>
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
        <Input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>
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
