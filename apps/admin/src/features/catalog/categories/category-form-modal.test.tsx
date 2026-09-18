import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Category } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { createCategory, updateCategory } from './api';
import { CategoryFormModal } from './category-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, createCategory: vi.fn(), updateCategory: vi.fn() };
});

const mockedCreateCategory = vi.mocked(createCategory);
const mockedUpdateCategory = vi.mocked(updateCategory);

function cat(id: string, name: string, overrides: Partial<Category> = {}): Category {
  return {
    id,
    parentId: null,
    slug: id,
    name: { en: name },
    path: id,
    depth: 1,
    position: 0,
    isActive: true,
    brandRequirement: 'optional',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedCreateCategory.mockReset();
  mockedUpdateCategory.mockReset();
});

describe('CategoryFormModal — create', () => {
  it('the slug auto-derives from the name until the slug field is touched directly', async () => {
    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        allCategories={[]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name (English)'), {
      target: { value: 'New Category' },
    });
    expect(screen.getByLabelText('Slug')).toHaveValue('new-category');

    // editing the slug directly stops it from following the name any further
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), {
      target: { value: 'New Category Two' },
    });
    expect(screen.getByLabelText('Slug')).toHaveValue('custom-slug');
  });

  it('submits a create request with the picked parent, then closes', async () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    mockedCreateCategory.mockResolvedValueOnce(cat('cat1', 'New Category'));

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={onOpenChange}
        mode="create"
        allCategories={[cat('parent1', 'Parent')]}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name (English)'), {
      target: { value: 'New Category' },
    });
    fireEvent.change(screen.getByLabelText('Parent'), { target: { value: 'parent1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedCreateCategory).toHaveBeenCalledTimes(1));
    expect(mockedCreateCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'new-category',
        name: { en: 'New Category' },
        parentId: 'parent1',
      }),
    );
    expect(onSaved).toHaveBeenCalledWith('created', expect.objectContaining({ id: 'cat1' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a name/slug matching another live category is flagged client-side, before any request is sent', async () => {
    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        allCategories={[cat('other', 'Taken Name', { slug: 'taken-slug' })]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Taken Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Another category already has that name (names are case-insensitive).',
      ),
    ).toBeInTheDocument();
    expect(mockedCreateCategory).not.toHaveBeenCalled();
  });

  it('a server-side taken-slug error is set on the slug field, not a generic toast/form error', async () => {
    mockedCreateCategory.mockRejectedValueOnce(new AdminApiError('CATEGORY_SLUG_TAKEN', 409));

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        allCategories={[]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That slug is already in use by another category.'),
    ).toBeInTheDocument();
    // scoped under the slug field specifically, not a bare form-level line
    expect(screen.getByLabelText('Slug')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('CategoryFormModal — edit', () => {
  it('a no-op save (nothing changed) closes without calling updateCategory — the 2026-09-18 fix, now with direct coverage', async () => {
    const onOpenChange = vi.fn();
    const category = cat('cat1', 'Existing');

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        category={category}
        allCategories={[category]}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockedUpdateCategory).not.toHaveBeenCalled();
  });

  it('sends only the changed field(s), plus expectedUpdatedAt — not the whole form', async () => {
    const category = cat('cat1', 'Existing', { updatedAt: '2026-02-01T00:00:00.000Z' });
    mockedUpdateCategory.mockResolvedValueOnce({ ...category, name: { en: 'Renamed' } });

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        category={category}
        allCategories={[category]}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedUpdateCategory).toHaveBeenCalledTimes(1));
    expect(mockedUpdateCategory).toHaveBeenCalledWith('cat1', {
      name: { en: 'Renamed' },
      expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('a CONFLICT (row changed elsewhere since this form opened) calls onConflict instead of showing a form error', async () => {
    const onConflict = vi.fn();
    const category = cat('cat1', 'Existing');
    mockedUpdateCategory.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        category={category}
        allCategories={[category]}
        onSaved={vi.fn()}
        onConflict={onConflict}
      />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('an archived category renders read-only: fields disabled, Restore in place of Delete, no Save button', async () => {
    const category = cat('cat1', 'Gone', { archivedAt: '2026-01-05T00:00:00.000Z' });
    const onRestore = vi.fn();

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        category={category}
        allCategories={[]}
        onSaved={vi.fn()}
        onRestore={onRestore}
      />,
    );

    await screen.findByDisplayValue('Gone');
    expect(screen.getByLabelText('Name (English)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(category);
  });

  it('an archived category whose parent is also archived disables Restore with an explanatory tooltip', async () => {
    const category = cat('cat1', 'Gone', { archivedAt: '2026-01-05T00:00:00.000Z' });

    renderAdmin(
      <CategoryFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        category={category}
        allCategories={[]}
        onSaved={vi.fn()}
        onRestore={vi.fn()}
        restoreBlocked
      />,
    );

    await screen.findByDisplayValue('Gone');
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });
});
