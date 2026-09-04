'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import { Button, Field, Input } from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createCategory, getCategory, listCategories, moveCategory, updateCategory } from './api';

const formSchema = z.object({
  parentId: z.string(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug'),
  nameEn: z.string().trim().min(1).max(200),
  position: z.coerce.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  brandRequirement: z.enum(['required', 'optional', 'none']),
});
type FormValues = z.infer<typeof formSchema>;

type Props = { locale: string; basePath: string } & (
  | { mode: 'create' }
  | { mode: 'edit'; id: string }
);

export function CategoryForm(props: Props) {
  const { locale, basePath } = props;
  const t = useTranslations('catalog');
  const router = useRouter();
  const listHref = `/${locale}/${basePath}/catalog/categories`;

  const [all, setAll] = useState<Category[]>([]);
  const [current, setCurrent] = useState<Category | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      parentId: '',
      slug: '',
      nameEn: '',
      position: 0,
      isActive: true,
      brandRequirement: 'optional',
    },
  });

  useEffect(() => {
    listCategories({ includeInactive: true })
      .then(setAll)
      .catch(() => setAll([]));
    if (props.mode === 'edit') {
      getCategory(props.id)
        .then((c) => {
          setCurrent(c);
          reset({
            parentId: c.parentId ?? '',
            slug: c.slug,
            nameEn: c.name['en'] ?? '',
            position: c.position,
            isActive: c.isActive,
            brandRequirement: c.brandRequirement,
          });
        })
        .catch((e: unknown) =>
          setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined))),
        );
    }
  }, []);

  const parentOptions = useMemo(() => {
    const selfPrefix = current ? `${current.path}.` : null;
    return all.filter(
      (c) =>
        c.id !== (props.mode === 'edit' ? props.id : '') &&
        !(selfPrefix && c.path.startsWith(selfPrefix)),
    );
  }, [all, current, props]);

  async function onSubmit(v: FormValues) {
    setFormError(null);
    const name = { en: v.nameEn };
    try {
      if (props.mode === 'create') {
        await createCategory({
          slug: v.slug,
          name,
          parentId: v.parentId || null,
          position: v.position,
          isActive: v.isActive,
          brandRequirement: v.brandRequirement,
        });
      } else {
        await updateCategory(props.id, {
          slug: v.slug,
          name,
          position: v.position,
          isActive: v.isActive,
          brandRequirement: v.brandRequirement,
        });
        if ((current?.parentId ?? '') !== v.parentId) {
          await moveCategory(props.id, { parentId: v.parentId || null, position: v.position });
        }
      }
      router.push(listHref);
      router.refresh();
    } catch (e) {
      setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    }
  }

  const req = t('categories.form.required');

  return (
    <section className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {props.mode === 'create'
          ? t('categories.form.createTitle')
          : t('categories.form.editTitle')}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Field label={t('categories.form.parent')} htmlFor="parentId">
          <select
            id="parentId"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            {...register('parentId')}
          >
            <option value="">{t('categories.form.parentNone')}</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {' '.repeat((c.depth - 1) * 2)}
                {c.name['en'] ?? c.slug}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t('categories.form.name')}
          htmlFor="nameEn"
          error={errors.nameEn ? req : undefined}
        >
          <Input id="nameEn" invalid={!!errors.nameEn} {...register('nameEn')} />
        </Field>

        <Field
          label={t('categories.form.slug')}
          htmlFor="slug"
          hint={t('categories.form.slugHint')}
          error={errors.slug ? t('categories.form.slugHint') : undefined}
        >
          <Input id="slug" invalid={!!errors.slug} {...register('slug')} />
        </Field>

        <Field
          label={t('categories.form.position')}
          htmlFor="position"
          error={errors.position ? req : undefined}
        >
          <Input id="position" type="number" min={0} {...register('position')} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('isActive')} />
          {t('categories.form.isActive')}
        </label>

        <Field label={t('categories.form.brandRequirement')} htmlFor="brandRequirement">
          <select
            id="brandRequirement"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            {...register('brandRequirement')}
          >
            <option value="required">{t('categories.form.brandRequired')}</option>
            <option value="optional">{t('categories.form.brandOptional')}</option>
            <option value="none">{t('categories.form.brandNone')}</option>
          </select>
        </Field>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={isSubmitting} loadingText={t('categories.form.saving')}>
            {t('categories.form.save')}
          </Button>
          <Link href={listHref} className="text-sm underline">
            {t('categories.form.back')}
          </Link>
        </div>
      </form>
    </section>
  );
}
