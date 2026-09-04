'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import { Field, Input } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createCategory, moveCategory, updateCategory } from './api';

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

const EMPTY: FormValues = {
  parentId: '',
  slug: '',
  nameEn: '',
  position: 0,
  isActive: true,
  brandRequirement: 'optional',
};

export function CategoryFormModal({
  open,
  onOpenChange,
  mode,
  category,
  allCategories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  category?: Category | undefined;
  allCategories: Category[];
  onSaved: (action: 'created' | 'updated', c: Category) => void;
}) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (mode === 'edit' && category) {
      reset({
        parentId: category.parentId ?? '',
        slug: category.slug,
        nameEn: category.name['en'] ?? '',
        position: category.position,
        isActive: category.isActive,
        brandRequirement: category.brandRequirement,
      });
    } else {
      reset(EMPTY);
    }
  }, [open, mode, category, reset]);

  const parentOptions = useMemo(() => {
    if (mode === 'create' || !category) return allCategories;
    const selfPrefix = `${category.path}.`;
    return allCategories.filter((c) => c.id !== category.id && !c.path.startsWith(selfPrefix));
  }, [allCategories, mode, category]);

  async function onSubmit(v: FormValues): Promise<void> {
    setFormError(null);
    const name = { en: v.nameEn };
    try {
      if (mode === 'create') {
        const c = await createCategory({
          slug: v.slug,
          name,
          parentId: v.parentId || null,
          position: v.position,
          isActive: v.isActive,
          brandRequirement: v.brandRequirement,
        });
        onSaved('created', c);
      } else if (category) {
        let c = await updateCategory(category.id, {
          slug: v.slug,
          name,
          position: v.position,
          isActive: v.isActive,
          brandRequirement: v.brandRequirement,
        });
        if ((category.parentId ?? '') !== v.parentId) {
          c = await moveCategory(category.id, {
            parentId: v.parentId || null,
            position: v.position,
          });
        }
        onSaved('updated', c);
      }
      onOpenChange(false);
    } catch (e) {
      setFormError(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    }
  }

  const selectCls = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={t(mode === 'create' ? 'categories.form.createTitle' : 'categories.form.editTitle')}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={t('categories.form.save')}
      dirty={isDirty}
    >
      <Field label={t('categories.form.parent')} htmlFor="cat-parent">
        <select id="cat-parent" className={selectCls} {...register('parentId')}>
          <option value="">{t('categories.form.parentNone')}</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {'  '.repeat(Math.max(0, c.depth - 1))}
              {c.name['en'] ?? c.slug}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t('categories.form.name')}
        htmlFor="cat-name"
        error={errors.nameEn ? t('categories.form.required') : undefined}
      >
        <Input id="cat-name" invalid={Boolean(errors.nameEn)} {...register('nameEn')} />
      </Field>

      <Field
        label={t('categories.form.slug')}
        htmlFor="cat-slug"
        hint={t('categories.form.slugHint')}
        error={errors.slug ? t('categories.form.slugHint') : undefined}
      >
        <Input id="cat-slug" invalid={Boolean(errors.slug)} {...register('slug')} />
      </Field>

      <Field
        label={t('categories.form.position')}
        htmlFor="cat-pos"
        error={errors.position ? t('categories.form.required') : undefined}
      >
        <Input id="cat-pos" type="number" min={0} {...register('position')} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} />
        {t('categories.form.isActive')}
      </label>

      <Field label={t('categories.form.brandRequirement')} htmlFor="cat-brand">
        <select id="cat-brand" className={selectCls} {...register('brandRequirement')}>
          <option value="required">{t('categories.form.brandRequired')}</option>
          <option value="optional">{t('categories.form.brandOptional')}</option>
          <option value="none">{t('categories.form.brandNone')}</option>
        </select>
      </Field>

      {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
    </FormModal>
  );
}
