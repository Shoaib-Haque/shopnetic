'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import {
  staffInviteCreateRequestSchema,
  type StaffInviteCreateRequest,
} from '@shopnetic/contracts';
import { Button, Field, Input, notify } from '@shopnetic/ui';
import { PageHeader } from '@/components/crud/page-header';
import { postJson } from '@/features/staff-auth/submit';
import { staffErrorKey, extractErrorCode } from '@/features/staff-auth/error-copy';

const ROLES: StaffInviteCreateRequest['role'][] = ['SERVICE_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
const selectCls = 'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm';

export function InviteStaffForm() {
  const t = useTranslations('staff');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffInviteCreateRequest>({
    resolver: zodResolver(staffInviteCreateRequestSchema),
    defaultValues: { email: '', role: 'ADMIN' },
    mode: 'onTouched',
  });

  return (
    <section>
      <PageHeader title={t('invite.title')} description={t('invite.intro')} />
      <form
        noValidate
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setFormError(null);
          const res = await postJson('/api/staff-auth/invite', values);
          if (res.status === 202) {
            notify.saved(t('invite.sent', { email: values.email }));
            reset({ email: '', role: values.role });
            return;
          }
          setFormError(
            res.status === 0 ? t('errors.network') : t(staffErrorKey(extractErrorCode(res.body))),
          );
        })}
      >
        <Field
          label={t('fields.email')}
          htmlFor="invite-email"
          error={errors.email ? t('fields.emailInvalid') : undefined}
        >
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>
        <Field label={t('invite.roleLabel')} htmlFor="invite-role">
          <select id="invite-role" className={selectCls} {...register('role')}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`invite.roles.${role}`)}
              </option>
            ))}
          </select>
        </Field>
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting} loadingText={t('invite.submitting')}>
          {t('invite.submit')}
        </Button>
      </form>
    </section>
  );
}
