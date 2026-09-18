import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Brand } from '@shopnetic/contracts';
import { adminApi, AdminApiError } from '@/features/admin-api/client';
import { renderAdmin } from '@/test/render';
import { BrandList } from './brand-list';

vi.mock('@/features/admin-api/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/admin-api/client')>(
    '@/features/admin-api/client',
  );
  return { ...actual, adminApi: vi.fn() };
});

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/en/x7f2k9t3m1qp/catalog/brands',
  useSearchParams: () => mockSearchParams,
}));

const mockedAdminApi = vi.mocked(adminApi);

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

/** every BrandList/BrandMergeDialog call is the raw `{data, meta}` envelope. */
const page = (items: Brand[], nextCursor?: string) => ({
  data: items,
  meta: nextCursor ? { nextCursor } : {},
});

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockedAdminApi.mockReset();
});

describe('BrandList', () => {
  it('renders the live list, with a status/restricted badge per row', async () => {
    mockedAdminApi.mockResolvedValueOnce(
      page([
        brand('a', 'Acme', { status: 'pending' }),
        brand('b', 'Zenith', { isRestricted: true }),
      ]),
    );

    renderAdmin(<BrandList />);

    expect(await screen.findAllByText('Acme')).not.toHaveLength(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0);
  });

  it('creating a brand posts the form and shows the created toast', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount
      .mockResolvedValueOnce(brand('new-1', 'Fresh Co')) // #2 POST /brands
      .mockResolvedValueOnce(page([brand('new-1', 'Fresh Co')])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findByText('No brands yet.');

    fireEvent.click(screen.getByRole('button', { name: /New brand/i }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Fresh Co' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Brand “Fresh Co” created.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/brands',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('deleting a brand shows an undo toast (soft-delete, no confirm dialog)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(undefined) // #2 DELETE
      .mockResolvedValueOnce(page([])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Brand “Acme” deleted.')).toBeInTheDocument();
  });

  it('merging searches for a target, then posts the merge and shows the merged toast', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme'), brand('b', 'Zenith')])) // #1 mount
      .mockResolvedValueOnce(page([brand('a', 'Acme'), brand('b', 'Zenith')])) // #2 merge dialog's own search
      .mockResolvedValueOnce(brand('b', 'Zenith')) // #3 POST /brands/a/merge
      .mockResolvedValueOnce(page([brand('b', 'Zenith')])); // #4 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getAllByRole('button', { name: 'Merge' })[0]!);
    await screen.findByText('Merge “Acme” into…');

    // the source itself is excluded from its own merge target list
    const results = await screen.findAllByText('Zenith');
    expect(screen.queryByText('Acme', { selector: 'button *' })).not.toBeInTheDocument();

    fireEvent.click(results[results.length - 1]!.closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(await screen.findByText('“Acme” merged into “Zenith”.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      3,
      '/brands/a/merge',
      expect.objectContaining({ method: 'POST', body: { intoBrandId: 'b' } }),
    );
  });

  it('an AdminApiError on the first load shows the error line, not the empty state', async () => {
    mockedAdminApi.mockRejectedValueOnce(new AdminApiError('INTERNAL', 500));

    renderAdmin(<BrandList />);

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.queryByText('No brands yet.')).not.toBeInTheDocument();
  });

  it('a status filter picked on Live is not silently carried into the Archived query — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount (live)
      .mockResolvedValueOnce(page([brand('a', 'Acme', { status: 'pending' })])) // #2 live, status=pending
      .mockResolvedValueOnce(page([])); // #3 switch to archived

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pending' } });
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findByText('No brands yet.');

    const archivedCall = mockedAdminApi.mock.calls[2]?.[0] as string;
    expect(archivedCall).toContain('archived=true');
    expect(archivedCall).not.toContain('status=');
  });

  it('adding an alias updates the row in place — no extra list reload — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(
        brand('a', 'Acme', {
          aliases: [{ id: 'al1', alias: 'ACM', createdAt: '2026-01-01T00:00:00.000Z' }],
        }),
      ); // #2 POST /brands/a/aliases

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    await screen.findByText('Edit brand');

    fireEvent.change(screen.getByPlaceholderText('Add an alias…'), { target: { value: 'ACM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Alias “ACM” added.')).toBeInTheDocument();
    // exactly the mount + the add-alias call — no third (resync) call
    expect(mockedAdminApi).toHaveBeenCalledTimes(2);
  });

  it('a duplicate-alias error renders inline under the field, not as a toast — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('BRAND_ALIAS_TAKEN', 409)); // #2 POST /aliases fails

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    await screen.findByText('Edit brand');

    const aliasInput = screen.getByPlaceholderText('Add an alias…');
    fireEvent.change(aliasInput, { target: { value: 'dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const err = await screen.findByText('That alias already maps to a brand.');
    expect(err.tagName).toBe('P');
    expect(aliasInput).toHaveAttribute('aria-invalid', 'true');
  });
});
