'use client';

import { useEffect, useState } from 'react';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { isReservedSlug, type Brand } from '@shopnetic/contracts';
import { cn, Field, Input, notify, Spinner } from '@shopnetic/ui';
import { FormModal } from '@/components/crud/form-modal';
import { slugify, slugifyLive } from '@/lib/slugify';
import { AdminApiError } from '@/features/admin-api/client';
import { catalogErrorKey } from '@/features/catalog/error-copy';
import { addBrandAlias, createBrand, removeBrandAlias, updateBrand } from './api';

/** zod messages are translation keys under the `catalog` namespace, resolved at render. */
const formSchema = z.object({
  name: z.string().trim().min(1, 'brands.form.err.required').max(120, 'brands.form.err.nameLong'),
  slug: z
    .string()
    .trim()
    .max(80, 'brands.form.err.slugLong')
    .refine((s) => s === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'brands.form.err.slugFormat')
    .refine((s) => !isReservedSlug(s), 'brands.form.err.slugFormat'),
  displayNameEn: z.string().trim().max(200, 'brands.form.err.nameLong'),
  status: z.enum(['pending', 'active', 'rejected']),
  isRestricted: z.boolean(),
  logoKey: z.string().trim().max(500, 'brands.form.err.logoKeyLong'),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  name: '',
  slug: '',
  displayNameEn: '',
  status: 'active',
  isRestricted: false,
  logoKey: '',
};

/** API error code → the form field it belongs under. */
const FIELD_FOR_CODE: Record<string, Path<FormValues>> = {
  BRAND_NAME_TAKEN: 'name',
  BRAND_SLUG_TAKEN: 'slug',
};

/** collapse whitespace runs (incl. pasted newlines / tabs) to single spaces. */
const collapseWs = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function BrandFormModal({
  open,
  onOpenChange,
  mode,
  brand,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  brand?: Brand | undefined;
  onSaved: (action: 'created' | 'updated', b: Brand) => void;
  /** Edit mode only — close the modal, then run the list's delete flow. */
  onDelete?: (b: Brand) => void;
}) {
  const t = useTranslations('catalog');
  const [formError, setFormError] = useState<string | null>(null);
  /** false while the slug still mirrors the name (create form only). */
  const [slugTouched, setSlugTouched] = useState(false);

  // Aliases aren't part of the PATCH body — they're their own endpoints, so
  // they're tracked and mutated separately from the RHF form below, with
  // their own local optimistic list (seeded from `brand` each time the
  // modal opens, same as the form itself).
  const [aliases, setAliases] = useState<Brand['aliases']>([]);
  const [newAlias, setNewAlias] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);
  const [removingAliasId, setRemovingAliasId] = useState<string | null>(null);
  // create mode only — aliases are part of the create request itself, so
  // they're staged as plain strings until submit rather than round-tripping
  // through the (not-yet-existing) brand's alias endpoints.
  const [draftAliases, setDraftAliases] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: EMPTY,
  });

  const fieldError = (name: Path<FormValues>): string | undefined => {
    const msg = errors[name]?.message;
    return msg ? t(msg) : undefined;
  };

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setSlugTouched(mode === 'edit');
    setNewAlias('');
    setDraftAliases([]);
    if (mode === 'edit' && brand) {
      reset({
        name: brand.name,
        slug: brand.slug,
        displayNameEn: brand.displayName?.['en'] ?? '',
        status: brand.status,
        isRestricted: brand.isRestricted,
        logoKey: brand.logoKey ?? '',
      });
      setAliases(brand.aliases);
    } else {
      reset(EMPTY);
      setAliases([]);
    }
  }, [open, mode, brand, reset]);

  // Create form: keep the slug in sync with the name until the user edits it.
  const name = watch('name');
  useEffect(() => {
    if (mode !== 'create' || slugTouched) return;
    setValue('slug', slugify(name ?? ''), { shouldDirty: true });
  }, [name, slugTouched, mode, setValue]);

  async function onSubmit(v: FormValues): Promise<void> {
    setFormError(null);
    clearErrors();
    const displayName = v.displayNameEn.trim() ? { en: v.displayNameEn.trim() } : undefined;
    try {
      if (mode === 'create') {
        const b = await createBrand({
          name: v.name,
          ...(v.slug ? { slug: v.slug } : {}),
          ...(displayName ? { displayName } : {}),
          status: v.status,
          isRestricted: v.isRestricted,
          ...(draftAliases.length ? { aliases: draftAliases } : {}),
        });
        onSaved('created', b);
      } else if (brand) {
        const d = dirtyFields;
        if (Object.keys(d).length) {
          const b = await updateBrand(brand.id, {
            ...(d.name ? { name: v.name } : {}),
            ...(d.slug ? { slug: v.slug } : {}),
            ...(d.displayNameEn ? { displayName: displayName ?? null } : {}),
            ...(d.status ? { status: v.status } : {}),
            ...(d.isRestricted ? { isRestricted: v.isRestricted } : {}),
            ...(d.logoKey ? { logoKey: v.logoKey || null } : {}),
          });
          onSaved('updated', b);
        }
      }
      onOpenChange(false);
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      const field = code ? FIELD_FOR_CODE[code] : undefined;
      if (field) {
        setError(field, { type: 'server', message: catalogErrorKey(code) }, { shouldFocus: true });
      } else {
        setFormError(t(catalogErrorKey(code)));
      }
    }
  }

  async function onAddAlias(): Promise<void> {
    const alias = newAlias.trim();
    if (!alias) return;
    if (mode === 'create') {
      if (!draftAliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
        setDraftAliases((prev) => [...prev, alias]);
      }
      setNewAlias('');
      return;
    }
    if (!brand) return;
    setAddingAlias(true);
    try {
      const b = await addBrandAlias(brand.id, { alias });
      setAliases(b.aliases);
      setNewAlias('');
      notify.saved(t('brands.toast.aliasAdded', { alias }));
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setAddingAlias(false);
    }
  }

  async function onRemoveAlias(aliasId: string, aliasText: string): Promise<void> {
    if (mode === 'create') return;
    if (!brand) return;
    setRemovingAliasId(aliasId);
    try {
      await removeBrandAlias(brand.id, aliasId);
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      notify.saved(t('brands.toast.aliasRemoved', { alias: aliasText }));
    } catch (e) {
      notify.error(t(catalogErrorKey(e instanceof AdminApiError ? e.code : undefined)));
    } finally {
      setRemovingAliasId(null);
    }
  }

  const selectCls =
    'h-10 w-full truncate rounded-md border border-input bg-background px-3 text-sm';

  const nameField = register('name');
  const slugField = register('slug');
  const displayNameField = register('displayNameEn');
  const logoKeyField = register('logoKey');

  const secondaryAction =
    mode === 'edit' && brand && onDelete ? (
      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          onDelete(brand);
        }}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        {t('brands.delete')}
      </button>
    ) : undefined;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={t(mode === 'create' ? 'brands.form.createTitle' : 'brands.form.editTitle')}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={t('brands.form.save')}
      {...(secondaryAction ? { secondaryAction } : {})}
      dirty={isDirty}
    >
      <Field label={t('brands.form.name')} htmlFor="brand-name" error={fieldError('name')}>
        <Input
          id="brand-name"
          maxLength={120}
          invalid={Boolean(errors.name)}
          {...nameField}
          onBlur={(e) => {
            e.currentTarget.value = collapseWs(e.currentTarget.value);
            void nameField.onChange(e);
            void nameField.onBlur(e);
          }}
        />
      </Field>

      <Field
        label={t('brands.form.slug')}
        htmlFor="brand-slug"
        hint={t('brands.form.slugHint')}
        error={fieldError('slug')}
      >
        <Input
          id="brand-slug"
          maxLength={80}
          invalid={Boolean(errors.slug)}
          {...slugField}
          onChange={(e) => {
            e.currentTarget.value = slugifyLive(e.currentTarget.value);
            void slugField.onChange(e);
            setSlugTouched(true);
          }}
          onBlur={(e) => {
            e.currentTarget.value = slugify(e.currentTarget.value);
            void slugField.onChange(e);
            void slugField.onBlur(e);
          }}
        />
      </Field>

      <Field
        label={t('brands.form.displayName')}
        htmlFor="brand-display-name"
        hint={t('brands.form.displayNameHint')}
        error={fieldError('displayNameEn')}
      >
        <Input
          id="brand-display-name"
          maxLength={200}
          invalid={Boolean(errors.displayNameEn)}
          {...displayNameField}
        />
      </Field>

      <Field label={t('brands.form.status')} htmlFor="brand-status" error={fieldError('status')}>
        <select
          id="brand-status"
          className={cn(selectCls, errors.status && 'border-destructive')}
          {...register('status')}
        >
          <option value="active">{t('brands.status.active')}</option>
          <option value="pending">{t('brands.status.pending')}</option>
          <option value="rejected">{t('brands.status.rejected')}</option>
        </select>
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" {...register('isRestricted')} />
        <span>
          {t('brands.form.isRestricted')}
          <span className="block text-xs font-normal text-muted-foreground">
            {t('brands.form.isRestrictedHint')}
          </span>
        </span>
      </label>

      <Field
        label={t('brands.form.logoKey')}
        htmlFor="brand-logo-key"
        hint={t('brands.form.logoKeyHint')}
        error={fieldError('logoKey')}
      >
        <Input
          id="brand-logo-key"
          maxLength={500}
          invalid={Boolean(errors.logoKey)}
          {...logoKeyField}
        />
      </Field>

      <Field label={t('brands.form.aliases')} hint={t('brands.form.aliasesHint')}>
        <div className="flex flex-wrap gap-1.5">
          {(mode === 'create' ? draftAliases : aliases.map((a) => a.alias)).map((alias, i) => {
            const aliasId = mode === 'create' ? undefined : aliases[i]?.id;
            const removing = aliasId != null && removingAliasId === aliasId;
            return (
              <span
                key={aliasId ?? alias}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                {alias}
                <button
                  type="button"
                  aria-label={t('brands.form.remove')}
                  disabled={removing}
                  onClick={() =>
                    mode === 'create'
                      ? setDraftAliases((prev) => prev.filter((_, idx) => idx !== i))
                      : aliasId && void onRemoveAlias(aliasId, alias)
                  }
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  {removing ? <Spinner className="size-3" /> : '×'}
                </button>
              </span>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-2">
          <Input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onAddAlias();
              }
            }}
            placeholder={t('brands.form.addAliasPlaceholder')}
            disabled={addingAlias}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => void onAddAlias()}
            disabled={addingAlias || !newAlias.trim()}
            className="rounded-md border border-input px-3 text-sm font-medium disabled:opacity-50"
          >
            {addingAlias ? <Spinner className="size-4" /> : t('brands.form.add')}
          </button>
        </div>
      </Field>

      {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
    </FormModal>
  );
}
