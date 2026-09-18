import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { brandAliasAvailable, createBrand, removeBrandAlias, updateBrand } from './api';
import { BrandFormModal } from './brand-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    brandAliasAvailable: vi.fn(),
    createBrand: vi.fn(),
    updateBrand: vi.fn(),
    removeBrandAlias: vi.fn(),
  };
});

const mockedBrandAliasAvailable = vi.mocked(brandAliasAvailable);
const mockedCreateBrand = vi.mocked(createBrand);
const mockedUpdateBrand = vi.mocked(updateBrand);
const mockedRemoveBrandAlias = vi.mocked(removeBrandAlias);

function brand(id: string, name: string, overrides: Partial<Brand> = {}): Brand {
  return {
    id,
    name,
    slug: id,
    displayName: null,
    logoKey: null,
    status: 'active',
    isRestricted: false,
    mergedIntoBrandId: null,
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedBrandAliasAvailable.mockReset();
  mockedCreateBrand.mockReset();
  mockedUpdateBrand.mockReset();
  mockedRemoveBrandAlias.mockReset();
});

describe('BrandFormModal — alias input', () => {
  it("a second Enter press while the first alias check is still in flight doesn't fire a second check — the 2026-09-18 fix", async () => {
    let resolveCheck!: (v: boolean) => void;
    mockedBrandAliasAvailable.mockReturnValueOnce(
      new Promise<boolean>((resolve) => (resolveCheck = resolve)),
    );

    renderAdmin(<BrandFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />);

    const input = screen.getByPlaceholderText('Add an alias…');
    fireEvent.change(input, { target: { value: 'acme' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // fired before the DOM has necessarily caught up to `disabled` — the
    // explicit in-function guard is what's actually under test here, not
    // the input's own `disabled` attribute.
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockedBrandAliasAvailable).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck(true);
    });
    expect(await screen.findByText('acme')).toBeInTheDocument();
  });
});

describe('BrandFormModal — create', () => {
  it('the slug auto-derives from the name until the slug field is touched directly', async () => {
    renderAdmin(<BrandFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Brand' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('new-brand');

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Brand Two' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('custom-slug');
  });

  it('a server-side taken-name error is set on the name field, not a generic form error', async () => {
    mockedCreateBrand.mockRejectedValueOnce(new AdminApiError('BRAND_NAME_TAKEN', 409));

    renderAdmin(<BrandFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'A brand with that name already exists (names are case-insensitive).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('BrandFormModal — edit', () => {
  it('a no-op save (nothing changed) closes without calling updateBrand', async () => {
    const onOpenChange = vi.fn();
    const b = brand('brand1', 'Existing');

    renderAdmin(
      <BrandFormModal open onOpenChange={onOpenChange} mode="edit" brand={b} onSaved={vi.fn()} />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockedUpdateBrand).not.toHaveBeenCalled();
  });

  it('sends only the changed field(s), plus expectedUpdatedAt — not the whole form', async () => {
    const b = brand('brand1', 'Existing', { updatedAt: '2026-02-01T00:00:00.000Z' });
    mockedUpdateBrand.mockResolvedValueOnce({ ...b, name: 'Renamed' });

    renderAdmin(
      <BrandFormModal open onOpenChange={vi.fn()} mode="edit" brand={b} onSaved={vi.fn()} />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedUpdateBrand).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBrand).toHaveBeenCalledWith('brand1', {
      name: 'Renamed',
      expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('a CONFLICT (row changed elsewhere since this form opened) calls onConflict instead of showing a form error', async () => {
    const onConflict = vi.fn();
    const b = brand('brand1', 'Existing');
    mockedUpdateBrand.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <BrandFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        brand={b}
        onSaved={vi.fn()}
        onConflict={onConflict}
      />,
    );

    await screen.findByDisplayValue('Existing');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('removes an alias on success and tells the list about it', async () => {
    const onAliasesChanged = vi.fn();
    const b = brand('brand1', 'Existing', {
      aliases: [{ id: 'al1', alias: 'EXI', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    mockedRemoveBrandAlias.mockResolvedValueOnce(undefined);

    renderAdmin(
      <BrandFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        brand={b}
        onSaved={vi.fn()}
        onAliasesChanged={onAliasesChanged}
      />,
    );

    await screen.findByText('EXI');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('EXI')).not.toBeInTheDocument());
    expect(mockedRemoveBrandAlias).toHaveBeenCalledWith('brand1', 'al1');
    expect(onAliasesChanged).toHaveBeenCalledWith(expect.objectContaining({ aliases: [] }));
  });
});
