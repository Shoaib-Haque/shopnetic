import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OptionType } from '@shopnetic/contracts';
import { adminApi, AdminApiError } from '@/features/admin-api/client';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { OptionTypeList } from './option-type-list';

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
  usePathname: () => '/en/x7f2k9t3m1qp/catalog/option-types',
  useSearchParams: () => mockSearchParams,
}));

const mockedAdminApi = vi.mocked(adminApi);

function optionType(id: string, code: string, overrides: Partial<OptionType> = {}): OptionType {
  return {
    id,
    code,
    name: { en: code },
    dataType: 'select',
    hasSwatch: false,
    status: 'active',
    values: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** every OptionTypeList call is the raw `{data, meta}` envelope
 * (`listOptionTypesPage` fetches with `raw: true` to read `meta.nextCursor`). */
const page = (items: OptionType[], nextCursor?: string) => ({
  data: items,
  meta: nextCursor ? { nextCursor } : {},
});

/** Radix's dropdown trigger opens on `pointerdown` (or Enter/Space/
 * ArrowDown) — jsdom's `fireEvent.click` never fires a `pointerdown` first,
 * so a plain click silently does nothing (same pattern Brand/Staff List's
 * own tests use). Desktop and mobile both render in jsdom regardless of
 * viewport, so more than one trigger exists per row — the first is the
 * desktop table's. */
function openRowMenu(): void {
  const trigger = screen.getAllByRole('button', { name: 'More actions' })[0]!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockedAdminApi.mockReset();
});

describe('OptionTypeList', () => {
  it('renders the list with a status badge per row', async () => {
    mockedAdminApi.mockResolvedValueOnce(
      page([optionType('a', 'color', { name: { en: 'Color' } }), optionType('b', 'size')]),
    );

    renderAdmin(<OptionTypeList />);

    expect(await screen.findAllByText('Color')).not.toHaveLength(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('an empty list shows the empty message, not a table', async () => {
    mockedAdminApi.mockResolvedValueOnce(page([]));

    renderAdmin(<OptionTypeList />);

    expect(await screen.findByText('No option types yet.')).toBeInTheDocument();
  });

  it('creating an option type posts the form and shows the created toast', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount
      .mockResolvedValueOnce(optionType('new-1', 'material', { name: { en: 'Material' } })) // #2 POST
      .mockResolvedValueOnce(page([optionType('new-1', 'material', { name: { en: 'Material' } })])); // #3 resync

    renderAdmin(<OptionTypeList />);
    await screen.findByText('No option types yet.');

    fireEvent.click(screen.getByRole('button', { name: /New option type/i }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'material' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Material' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Option type “Material” created.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/option-types',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('editing an option type patches only the changed field(s)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #1 mount
      .mockResolvedValueOnce(optionType('a', 'color', { name: { en: 'Colour' } })) // #2 PATCH
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Colour' } })])); // #3 resync

    renderAdmin(<OptionTypeList />);
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit option type');

    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Colour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Option type “Colour” saved.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/option-types/a',
      expect.objectContaining({
        method: 'PATCH',
        body: { name: { en: 'Colour' }, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
      }),
    );
  });

  it('deleting an option type shows an undo toast (soft-delete, no confirm dialog)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #1 mount
      .mockResolvedValueOnce(undefined) // #2 DELETE
      .mockResolvedValueOnce(page([])); // #3 resync

    renderAdmin(<OptionTypeList />);
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Option type “Color” deleted.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/option-types/a',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('undoing a delete restores the row', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #1 mount
      .mockResolvedValueOnce(undefined) // #2 DELETE
      .mockResolvedValueOnce(page([])) // #3 resync (now empty)
      .mockResolvedValueOnce(optionType('a', 'color', { name: { en: 'Color' } })) // #4 POST /restore
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])); // #5 resync

    renderAdmin(<OptionTypeList />);
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await screen.findByText('Option type “Color” deleted.');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(mockedAdminApi).toHaveBeenNthCalledWith(
        4,
        '/option-types/a/restore',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await screen.findAllByText('Color');
  });

  it('the Archived tab lists soft-deleted rows and restores them via a confirm dialog', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount (live)
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #2 switch to archived
      .mockResolvedValueOnce(optionType('a', 'color', { name: { en: 'Color' } })) // #3 POST /restore
      .mockResolvedValueOnce(page([])); // #4 resync (archived, now empty)

    renderAdmin(<OptionTypeList />);
    await screen.findByText('No option types yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await screen.findByText('Option type “Color” restored.');
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      3,
      '/option-types/a/restore',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('a status filter picked on Live is not silently carried into the Archived query', async () => {
    mockedAdminApi.mockResolvedValue(page([]));

    renderAdmin(<OptionTypeList />);
    await screen.findByText('No option types yet.');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'active' } });
    await waitFor(() =>
      expect(mockedAdminApi).toHaveBeenLastCalledWith('/option-types?status=active&limit=30', {
        raw: true,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() =>
      expect(mockedAdminApi).toHaveBeenLastCalledWith('/option-types?archived=true&limit=30', {
        raw: true,
      }),
    );
  });

  it('the post-mutation resync never re-shows the loading skeleton — rows stay on screen while it refetches in the background', async () => {
    let resolveResync!: (v: { data: OptionType[]; meta: object }) => void;
    mockedAdminApi
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #1 mount
      .mockResolvedValueOnce(optionType('a', 'color', { name: { en: 'Colour' } })) // #2 PATCH
      .mockReturnValueOnce(new Promise((resolve) => (resolveResync = resolve))); // #3 resync — held open

    renderAdmin(<OptionTypeList />);
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit option type');

    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Colour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Option type “Colour” saved.');
    // the resync (#3) is still in flight — the old row must still be on
    // screen, not blanked out by the skeleton (the 2026-09-25 fix)
    expect(screen.getAllByText('Color').length).toBeGreaterThan(0);
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();

    resolveResync(page([optionType('a', 'color', { name: { en: 'Colour' } })]));
    await screen.findAllByText('Colour');
  });

  it("a stale edit conflict closes the modal, refetches, and notifies — mirrors Brand/Category's own guard", async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })])) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('CONFLICT', 409)) // #2 PATCH
      .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color Renamed' } })])); // #3 resync

    renderAdmin(<OptionTypeList />);
    await screen.findAllByText('Color');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit option type');

    fireEvent.change(screen.getByLabelText('Name (English)'), {
      target: { value: 'Color Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This option type was changed elsewhere — the list has been refreshed. Reopen it to try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Edit option type')).not.toBeInTheDocument();
    await screen.findAllByText('Color Renamed');
  });

  it('a search query is sent to the API as `q`', async () => {
    mockedAdminApi.mockResolvedValue(page([]));

    renderAdmin(<OptionTypeList />);
    await screen.findByText('No option types yet.');

    fireEvent.change(screen.getByPlaceholderText('Search option types…'), {
      target: { value: 'col' },
    });

    await waitFor(() =>
      expect(mockedAdminApi).toHaveBeenLastCalledWith('/option-types?q=col&limit=30', {
        raw: true,
      }),
    );
  });

  it('an AdminApiError on the first load shows the error line, not the empty state', async () => {
    mockedAdminApi.mockRejectedValueOnce(new AdminApiError('INTERNAL', 500));

    renderAdmin(<OptionTypeList />);

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.queryByText('No option types yet.')).not.toBeInTheDocument();
  });

  describe('pagination — loads on scroll', () => {
    it('fetches the next page when the scroll sentinel comes into view; the sentinel disappears once there is no next cursor', async () => {
      mockedAdminApi
        .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })], 'a')) // #1 mount, more to come
        .mockResolvedValueOnce(page([optionType('b', 'size', { name: { en: 'Size' } })])); // #2 next page, no more

      renderAdmin(<OptionTypeList />);
      await screen.findAllByText('Color');
      expect(screen.queryByText('Size')).not.toBeInTheDocument();

      const sentinel = screen.getByTestId('scroll-sentinel');
      act(() => triggerIntersection(sentinel));

      await screen.findAllByText('Size');
      expect(mockedAdminApi).toHaveBeenNthCalledWith(2, '/option-types?cursor=a&limit=30', {
        raw: true,
      });
      expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
    });
  });

  describe('deep link from Audit Log (?highlight=id)', () => {
    it('flashes the target row when it is already on the first page', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'b' });
      mockedAdminApi.mockResolvedValueOnce(
        page([
          optionType('a', 'color', { name: { en: 'Color' } }),
          optionType('b', 'ram', { name: { en: 'RAM' } }),
        ]),
      );

      renderAdmin(<OptionTypeList />);
      await screen.findAllByText('RAM');

      expect(document.querySelector('[data-option-type-row="b"]')).toHaveClass('sn-row-flash');
    });

    it('keeps loading pages until the target turns up, then flashes it', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      mockedAdminApi
        .mockResolvedValueOnce(page([optionType('a', 'color', { name: { en: 'Color' } })], 'a'))
        .mockResolvedValueOnce(page([optionType('z', 'zzz', { name: { en: 'ZZZ' } })]));

      renderAdmin(<OptionTypeList />);
      await screen.findAllByText('ZZZ');

      expect(document.querySelector('[data-option-type-row="z"]')).toHaveClass('sn-row-flash');
      expect(mockedAdminApi).toHaveBeenNthCalledWith(2, '/option-types?cursor=a&limit=30', {
        raw: true,
      });
    });

    it('without a highlight param, nothing flashes', async () => {
      mockedAdminApi.mockResolvedValueOnce(
        page([optionType('a', 'color', { name: { en: 'Color' } })]),
      );

      renderAdmin(<OptionTypeList />);
      await screen.findAllByText('Color');

      expect(document.querySelector('[data-option-type-row="a"]')).not.toHaveClass('sn-row-flash');
    });
  });
});
