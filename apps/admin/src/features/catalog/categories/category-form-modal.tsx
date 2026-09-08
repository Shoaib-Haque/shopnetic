'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import type { Category } from '@shopnetic/contracts';
import { cn, Field, Input } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { createCategory, updateCategory } from './api';

/** zod messages are translation keys under the `catalog` namespace, resolved at render. */
const formSchema = z.object({
  parentId: z.string(),
  slug: z
    .string()
    .trim()
    .min(1, 'categories.form.err.required')
    .max(80, 'categories.form.err.slugLong')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'categories.form.err.slugFormat'),
  nameEn: z
    .string()
    .trim()
    .min(1, 'categories.form.err.required')
    .max(200, 'categories.form.err.nameLong'),
  position: z.coerce
    .number({ invalid_type_error: 'categories.form.err.positionNumber' })
    .int('categories.form.err.positionNumber')
    .min(0, 'categories.form.err.positionRange')
    .max(100_000, 'categories.form.err.positionRange'),
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

/** API error code → the form field it belongs under. */
const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  CATEGORY_NAME_TAKEN: 'nameEn',
  CATEGORY_SLUG_TAKEN: 'slug',
  CATEGORY_PARENT_INVALID: 'parentId',
  CATEGORY_PARENT_ARCHIVED: 'parentId',
  CATEGORY_CYCLE: 'parentId',
};

const norm = (s: string): string => s.trim().toLowerCase();

/** Cap a `<select>` option label — the open dropdown's width isn't CSS-bounded. */
const clip = (s: string, max = 64): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** lowercase, strip accents, drop apostrophes, other punctuation → single hyphens. */
function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function CategoryFormModal({
  open,
  onOpenChange,
  mode,
  category,
  initialParentId,
  allCategories,
  restoreBlocked = false,
  onSaved,
  onDelete,
  onRestore,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  category?: Category | undefined;
  /** Create mode only — pre-select this parent (still editable). */
  initialParentId?: string | undefined;
  allCategories: Category[];
  /** Edit mode, archived row — its parent is still archived, so Restore would fail. */
  restoreBlocked?: boolean;
  onSaved: (action: 'created' | 'updated', c: Category) => void;
  /** Edit mode only — close the modal, then run the list's delete / restore flow. */
  onDelete?: (c: Category) => void;
  onRestore?: (c: Category) => void;
  /** Edit mode — the save hit a 409 (row changed since it was opened). The list
   *  owner should close this modal, refetch, and tell the user to reopen. */
  onConflict?: () => void;
}) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);
  /** false while the slug still mirrors the name (create form only). */
  const [slugTouched, setSlugTouched] = useState(false);

  // Live name/slug sets of the *other* categories, for up-front duplicate errors.
  const dupRef = useRef<{ names: Set<string>; slugs: Set<string> }>({
    names: new Set(),
    slugs: new Set(),
  });
  useEffect(() => {
    const names = new Set<string>();
    const slugs = new Set<string>();
    for (const c of allCategories) {
      if (c.id === category?.id) continue;
      names.add(norm(c.name['en'] ?? ''));
      slugs.add(norm(c.slug));
    }
    dupRef.current = { names, slugs };
  }, [allCategories, category]);

  // zod (shape/format) + a client-side duplicate check, so every offending field
  // shows its own error in one pass instead of one server round-trip at a time.
  const resolver = useMemo<Resolver<FormValues>>(
    () => async (values, ctx, opts) => {
      const res = await zodResolver(formSchema)(values, ctx, opts);
      const errors = { ...res.errors };
      const { names, slugs } = dupRef.current;
      const nm = norm(String(values.nameEn ?? ''));
      const sl = norm(String(values.slug ?? ''));
      if (!errors.nameEn && nm && names.has(nm)) {
        errors.nameEn = { type: 'duplicate', message: 'errors.categoryNameTaken' };
      }
      if (!errors.slug && sl && slugs.has(sl)) {
        errors.slug = { type: 'duplicate', message: 'errors.categorySlugTaken' };
      }
      return Object.keys(errors).length ? { values: {}, errors } : res;
    },
    [],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues: EMPTY });

  /** Resolve a field's error (zod message or server key) to display text. */
  const fieldError = (name: Path<FormValues>): string | undefined => {
    const msg = errors[name]?.message;
    return msg ? t(msg) : undefined;
  };

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setSlugTouched(mode === 'edit');
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
      reset({ ...EMPTY, parentId: initialParentId ?? '' });
    }
  }, [open, mode, category, initialParentId, reset]);

  // Create form: keep the slug in sync with the name until the user edits it.
  const nameEn = watch('nameEn');
  const slugValue = watch('slug');
  useEffect(() => {
    if (mode !== 'create' || slugTouched) return;
    setValue('slug', slugify(nameEn ?? ''), { shouldDirty: true });
  }, [nameEn, slugTouched, mode, setValue]);

  const parentOptions = useMemo(() => {
    if (mode === 'create' || !category) return allCategories;
    const selfPrefix = `${category.path}.`;
    return allCategories.filter((c) => c.id !== category.id && !c.path.startsWith(selfPrefix));
  }, [allCategories, mode, category]);

  async function onSubmit(v: FormValues): Promise<void> {
    setFormError(null);
    clearErrors(); // drop any server errors from a previous attempt
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
        // Send only what changed — a no-op save must not write an audit event,
        // and a single-field edit must not trigger an unrelated path rewrite.
        const d = dirtyFields;
        if (!Object.keys(d).length) {
          onOpenChange(false);
          return;
        }
        const c = await updateCategory(category.id, {
          ...(d.slug ? { slug: v.slug } : {}),
          ...(d.nameEn ? { name } : {}),
          ...(d.position ? { position: v.position } : {}),
          ...(d.isActive ? { isActive: v.isActive } : {}),
          ...(d.brandRequirement ? { brandRequirement: v.brandRequirement } : {}),
          ...(d.parentId ? { parentId: v.parentId || null } : {}),
          // guard against clobbering another admin's edit made since this form opened
          expectedUpdatedAt: category.updatedAt,
        });
        onSaved('updated', c);
      }
      onOpenChange(false);
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      if (code === 'CONFLICT' && onConflict) {
        onConflict(); // list owner closes this modal, refetches, and notifies
        return;
      }
      const field = code ? FIELD_FOR_CODE[code] : undefined;
      if (field) {
        setError(field, { type: 'server', message: catalogErrorKey(code) }, { shouldFocus: true });
      } else {
        setFormError(t(catalogErrorKey(code)));
      }
    }
  }

  const selectCls =
    'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm';

  const archived = category?.archivedAt != null;
  // an archived category is view-only in the modal — you restore it, you don't
  // edit it (the API's `update` rejects a soft-deleted row anyway).
  const readOnly = archived;
  const slugChanged = mode === 'edit' && !errors.slug && slugValue !== category?.slug;
  const restoreDisabled = archived && restoreBlocked;
  const secondaryAction =
    mode === 'edit' && category && (archived ? onRestore : onDelete) ? (
      // a disabled <button> eats hover events — the tooltip sits on the wrapper.
      <span
        className={cn('inline-flex', restoreDisabled && 'cursor-not-allowed')}
        {...(restoreDisabled ? { title: t('errors.categoryParentArchived') } : {})}
      >
        <button
          type="button"
          disabled={restoreDisabled}
          onClick={() => {
            onOpenChange(false);
            (archived ? onRestore : onDelete)?.(category);
          }}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50',
            archived
              ? 'text-primary hover:bg-primary/10'
              : 'text-destructive hover:bg-destructive/10',
          )}
        >
          {t(archived ? 'categories.restore' : 'categories.delete')}
        </button>
      </span>
    ) : undefined;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={t(
        readOnly
          ? 'categories.form.viewTitle'
          : mode === 'create'
            ? 'categories.form.createTitle'
            : 'categories.form.editTitle',
      )}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={t('categories.form.save')}
      {...(secondaryAction ? { secondaryAction } : {})}
      {...(readOnly ? { readOnly: true } : {})}
      dirty={isDirty}
    >
      <Field
        label={t('categories.form.parent')}
        htmlFor="cat-parent"
        error={fieldError('parentId')}
      >
        <select
          id="cat-parent"
          disabled={readOnly}
          className={cn(selectCls, errors.parentId && 'border-destructive')}
          {...register('parentId')}
        >
          <option value="">{t('categories.form.parentNone')}</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {'  '.repeat(Math.max(0, c.depth - 1))}
              {clip(c.name['en'] ?? c.slug)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('categories.form.name')} htmlFor="cat-name" error={fieldError('nameEn')}>
        <Input
          id="cat-name"
          maxLength={200}
          disabled={readOnly}
          invalid={Boolean(errors.nameEn)}
          {...register('nameEn')}
        />
      </Field>

      <Field
        label={t('categories.form.slug')}
        htmlFor="cat-slug"
        hint={t('categories.form.slugHint')}
        error={fieldError('slug')}
      >
        <Input
          id="cat-slug"
          maxLength={80}
          disabled={readOnly}
          invalid={Boolean(errors.slug)}
          {...register('slug', { onChange: () => setSlugTouched(true) })}
        />
      </Field>
      {slugChanged && (
        <p className="-mt-2 text-xs text-warning">{t('categories.form.slugChangeWarning')}</p>
      )}

      <Field label={t('categories.form.position')} htmlFor="cat-pos" error={fieldError('position')}>
        <Input
          id="cat-pos"
          type="number"
          min={0}
          max={100_000}
          disabled={readOnly}
          invalid={Boolean(errors.position)}
          {...register('position')}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={readOnly} {...register('isActive')} />
        {t('categories.form.isActive')}
      </label>

      <Field
        label={t('categories.form.brandRequirement')}
        htmlFor="cat-brand"
        error={fieldError('brandRequirement')}
      >
        <select
          id="cat-brand"
          disabled={readOnly}
          className={cn(selectCls, errors.brandRequirement && 'border-destructive')}
          {...register('brandRequirement')}
        >
          <option value="optional">{t('categories.form.brandOptional')}</option>
          <option value="required">{t('categories.form.brandRequired')}</option>
          <option value="none">{t('categories.form.brandNone')}</option>
        </select>
      </Field>

      {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
    </FormModal>
  );
}
