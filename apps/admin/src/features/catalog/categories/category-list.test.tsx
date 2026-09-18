import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Category } from '@shopnetic/contracts';
import { adminApi, AdminApiError } from '@/features/admin-api/client';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { CategoryList } from './category-list';

vi.mock('@/features/admin-api/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/admin-api/client')>(
    '@/features/admin-api/client',
  );
  return { ...actual, adminApi: vi.fn() };
});

const PATHNAME = '/en/x7f2k9t3m1qp/catalog/categories';
const routerReplace = vi.fn();
// per-test control over what `useSearchParams()` returns on mount —
// reassigned (not mutated) in `beforeEach`, and the mock factory re-reads
// this binding on every call rather than capturing one instance.
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => PATHNAME,
  useSearchParams: () => mockSearchParams,
}));

const mockedAdminApi = vi.mocked(adminApi);

/** minimal Category fixture — only the fields the list actually renders vary. */
function cat(id: string, name: string): Category {
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
  };
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const OFFLINE_ERROR = 'You appear to be offline. Check your connection and try again.';

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  routerReplace.mockReset();
});

afterEach(() => {
  cleanup();
  mockedAdminApi.mockReset();
});

describe('CategoryList error states', () => {
  it('shows the error line alone on a failed first load — never stacked on the empty state', async () => {
    mockedAdminApi.mockRejectedValueOnce(new AdminApiError('INTERNAL', 500)); // #1 mount GET

    renderAdmin(<CategoryList />);

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument();
    expect(screen.queryByText('No categories yet.')).not.toBeInTheDocument();
  });

  it('keeps the rows on screen when a background resync fails after a successful mutation', async () => {
    // queued strictly in call order: mount GET, DELETE, resync GET. `doDelete`'s
    // `finally { resync() }` fires the third call the instant the delete settles,
    // with no chance to queue mid-test — so every mock for this test goes in up
    // front, not interleaved with `await`s.
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount
      .mockResolvedValueOnce(undefined) // #2 delete succeeds
      .mockRejectedValueOnce(new AdminApiError('INTERNAL', 500)); // #3 resync fails

    renderAdmin(<CategoryList />);
    // jsdom doesn't apply the responsive `hidden md:block` classes, so both the
    // desktop tree and the mobile card list render at once — "Alpha" appears
    // twice. Real browsers show exactly one; `findAllByText` is the honest
    // query here, not a workaround for a product bug.
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByText(/deleted/i);

    // let the resync's rejected promise settle before asserting on its outcome
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
  });

  it('offline delete: shows the offline toast only, list stays intact (not the error line)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('OFFLINE', 0)) // #2 delete fails offline
      .mockRejectedValueOnce(new AdminApiError('OFFLINE', 0)); // #3 resync also fails offline

    renderAdmin(<CategoryList />);
    // jsdom doesn't apply the responsive `hidden md:block` classes, so both the
    // desktop tree and the mobile card list render at once — "Alpha" appears
    // twice. Real browsers show exactly one; `findAllByText` is the honest
    // query here, not a workaround for a product bug.
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(OFFLINE_ERROR)).toBeInTheDocument();
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
  });

  it('the Active switch toggles by clicking its label text, not just the switch itself — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount
      .mockResolvedValueOnce({ ...cat('a', 'Alpha'), isActive: false }) // #2 PATCH
      .mockResolvedValueOnce([{ ...cat('a', 'Alpha'), isActive: false }]); // #3 resync

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText('Edit category');

    const activeSwitch = dialog.getByRole('switch');
    expect(activeSwitch).toHaveAttribute('aria-checked', 'true');

    // click the *label*, not the switch control itself — a real `<label>`
    // wrapping a real `<button role="switch">` forwards the click
    // natively, same as it already did for the plain checkbox this
    // replaced. Scoped to the dialog — "Active" is also a status badge
    // elsewhere in the list.
    fireEvent.click(dialog.getByText('Active').closest('label')!);
    expect(activeSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Category “Alpha” saved.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/categories/a',
      expect.objectContaining({ body: expect.objectContaining({ isActive: false }) }),
    );
  });

  it('deleting an already-deleted row shows a calm "already deleted" toast, not the generic error — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404)) // #2 DELETE — someone else beat this tab to it
      .mockResolvedValueOnce([]); // #3 resync

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('“Alpha” was already deleted.')).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    // the stale row itself must also disappear from this tab, not just
    // the toast appear — `doDelete`'s `finally` already resyncs regardless
    // of outcome, so this is a regression guard, not a fix in itself.
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
  });

  it('restoring an already-restored row shows a calm "already restored" toast, not the generic error — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount (live tree)
      .mockResolvedValueOnce([]) // #2 tab-switch tree reload (pre-existing, unrelated)
      .mockResolvedValueOnce({
        data: [{ ...cat('z', 'Zulu'), archivedAt: '2026-01-01T00:00:00.000Z' }],
        meta: {},
      }) // #3 Archived tab flat page
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404)) // #4 POST restore — already restored elsewhere
      // #5/#6: resync() always fires now (moved to `finally`, the
      // 2026-09-18 fix found live) — it refreshes *both* the tree
      // (`load`) and, since we're on the Archived/flat tab, the flat
      // page (`flatRefresh`) too, in that order.
      .mockResolvedValueOnce([]) // #5 resync's tree reload
      .mockResolvedValueOnce({ data: [], meta: {} }); // #6 resync's flat refresh (archived, now empty)

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Zulu');

    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);

    expect(await screen.findByText('“Zulu” was already restored.')).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Zulu')).not.toBeInTheDocument());
  });

  it('restoring from the Archived tab does not blank the rest of the list while it resyncs — the 2026-09-18 fix', async () => {
    // before this fix, `resync()`'s flat side used `flatList.retry` (clears
    // `items` + shows the skeleton before refetching) instead of
    // `flatList.refresh` (swaps the page in, never blanks) — every
    // Archived/All-tab action had exactly the flash-then-reload Brand's
    // list was fixed for on 2026-09-17; Category's flat view just never
    // got the same fix, since its primary surface (the tree) was already
    // correct via a separate mechanism.
    let resolveFlatRefresh: (v: unknown) => void = () => {};
    const flatRefreshPromise = new Promise((resolve) => {
      resolveFlatRefresh = resolve;
    });

    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount (live tree)
      .mockResolvedValueOnce([]) // #2 tab-switch tree reload
      .mockResolvedValueOnce({
        data: [
          { ...cat('z', 'Zulu'), archivedAt: '2026-01-01T00:00:00.000Z' },
          { ...cat('y', 'Yankee'), archivedAt: '2026-01-01T00:00:00.000Z' },
        ],
        meta: {},
      }) // #3 Archived tab flat page
      .mockResolvedValueOnce({ ...cat('z', 'Zulu'), archivedAt: null }) // #4 POST restore — succeeds
      .mockResolvedValueOnce([]) // #5 resync's tree reload
      .mockImplementationOnce(() => flatRefreshPromise); // #6 resync's flat refresh — held open on purpose

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Zulu');
    await screen.findAllByText('Yankee');

    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);

    // the restore itself has resolved (toast shown) and resync()'s flat
    // call is in flight but deliberately unresolved — `.retry` blanks
    // `items` synchronously the moment it's called, well before its own
    // fetch settles, so this is exactly the window that would catch it;
    // `.refresh` must leave Yankee on screen here.
    await screen.findByText('Category “Zulu” restored.');
    expect(screen.getAllByText('Yankee').length).toBeGreaterThan(0);

    resolveFlatRefresh({
      data: [{ ...cat('y', 'Yankee'), archivedAt: '2026-01-01T00:00:00.000Z' }],
      meta: {},
    });
    await waitFor(() => expect(screen.queryByText('Zulu')).not.toBeInTheDocument());
    expect(screen.getAllByText('Yankee').length).toBeGreaterThan(0);
  });
});

describe('CategoryList flat/paginated views (Archived, All, search)', () => {
  it('switching to Archived fetches a paginated flat page instead of the tree’s load-all', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount GET — the active tree
      // switching tabs also re-triggers the tree's own (unpaginated, unrelated
      // to what's shown) reload — pre-existing behavior, unchanged by this feature
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ data: [cat('z', 'Zulu')], meta: {} }); // Archived tab GET — flat, raw envelope

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Zulu');
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('a search query is answered server-side, not filtered client-side over the tree’s rows', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount GET — the active tree
      .mockResolvedValueOnce({ data: [cat('b', 'Bravo')], meta: {} }); // #2 search GET — whatever the server says, trusted as-is

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    fireEvent.change(screen.getByPlaceholderText('Search categories…'), {
      target: { value: 'anything' },
    });
    // "Bravo" has no obvious relation to "anything" — this only renders if
    // the result came from the mocked server response, not a client-side
    // token match against the (unrelated) tree data already on screen
    expect(await screen.findAllByText('Bravo', {}, { timeout: 2000 })).not.toHaveLength(0);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('a link with status/q already in it pre-fills the tab and search box, and fetches that view on mount', async () => {
    mockSearchParams = new URLSearchParams({ status: 'archived' });
    mockedAdminApi
      .mockResolvedValueOnce([]) // #1 mount GET — the tree's own load, unconditional
      .mockResolvedValueOnce({ data: [cat('z', 'Zulu')], meta: {} }); // #2 Archived flat GET

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Zulu');

    expect(screen.getByRole('button', { name: 'Archived' })).toHaveClass('bg-muted');
  });

  it('an unrecognized status in the URL falls back to Live (the "active" status value) rather than crashing or sticking', async () => {
    mockSearchParams = new URLSearchParams({ status: 'not-a-real-status' });
    mockedAdminApi.mockResolvedValueOnce([cat('a', 'Alpha')]);

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    expect(screen.getByRole('button', { name: 'Live' })).toHaveClass('bg-muted');
  });

  it('switching status tabs replaces the URL (not push, so tab-switching never piles up history)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount GET — the active tree
      .mockResolvedValueOnce([]) // #2 the tree's own reload for the tab switch
      .mockResolvedValueOnce({ data: [cat('z', 'Zulu')], meta: {} }); // #3 Archived flat GET

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');
    routerReplace.mockClear(); // drop the mount-time no-op replace

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Zulu');

    expect(routerReplace).toHaveBeenLastCalledWith(`${PATHNAME}?status=archived`, {
      scroll: false,
    });
  });

  it('typing a search query replaces the URL once the debounce settles', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount GET — the active tree
      .mockResolvedValueOnce({ data: [cat('b', 'Bravo')], meta: {} }); // #2 search GET

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');
    routerReplace.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Search categories…'), {
      target: { value: 'bravo' },
    });
    await screen.findAllByText('Bravo', {}, { timeout: 2000 });

    expect(routerReplace).toHaveBeenLastCalledWith(`${PATHNAME}?q=bravo`, { scroll: false });
  });

  it('scrolling the sentinel into view on a flat page appends the next page', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha')]) // #1 mount GET — the active tree
      .mockResolvedValueOnce([]) // the tree's own reload for the tab switch (see test above)
      .mockResolvedValueOnce({ data: [cat('z1', 'Zulu1')], meta: { nextCursor: 'c1' } }) // Archived page 1
      .mockResolvedValueOnce({ data: [cat('z2', 'Zulu2')], meta: {} }); // Archived page 2

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Zulu1');

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));
    await screen.findAllByText('Zulu2');
  });
});

/**
 * A no-op `dataTransfer` stand-in: `onDrop` reads the dragged id from React
 * state (`dragId`, set in `onDragStart`), never from `dataTransfer.getData` —
 * so this only needs to accept the writes (`effectAllowed`, `dropEffect`,
 * `setData`) the handlers make, not actually store/retrieve anything.
 */
function fakeDataTransfer(): DataTransfer {
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    files: { length: 0, item: () => null, [Symbol.iterator]: function* () {} } as FileList,
    items: {
      length: 0,
      add: () => null,
      clear: () => {},
      remove: () => {},
      [Symbol.iterator]: function* () {},
    } as DataTransferItemList,
    types: [],
    setData: () => {},
    getData: () => '',
    clearData: () => {},
    setDragImage: () => {},
  } as DataTransfer;
}

describe('CategoryList drag-reorder rollback', () => {
  beforeEach(() => {
    // drag is gated on `(pointer: fine)` (category-list.tsx `canDrag`); the
    // global stub in vitest.setup.ts returns `matches: false` for everything,
    // so this suite needs its own override.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(pointer: fine)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
  });

  it('a failed drag-reorder rolls the tree back and shows an error toast — the moved row does not stay reparented', async () => {
    // #1 mount, #2 the drop's POST /reorder (fails). #3 is the post-failure
    // background resync applyMove's `finally` always fires — left forever
    // pending so it can't be what restores the tree; the assertion below
    // must be catching the `catch` block's own `setItems(snapshot)`, not a
    // lucky race with the resync's response landing first.
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha'), cat('b', 'Bravo')])
      .mockRejectedValueOnce(new AdminApiError('INTERNAL', 500))
      .mockImplementationOnce(() => new Promise(() => {}));

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');
    const rowA = document.querySelector('[data-cat-row="a"]');
    const rowB = document.querySelector('[data-cat-row="b"]');
    if (!rowA || !rowB) throw new Error('expected both rows to render');
    const originalLevel = rowA.getAttribute('aria-level');

    // drag A onto B. jsdom's `getBoundingClientRect` is a zero rect, so the
    // before/inside/after split (`(clientY - top) / height`) resolves to
    // `NaN` — the handler's `<0.3`/`>0.7` checks both fail, landing on
    // 'inside' (nest A under B). A deterministic, valid drop target; no need
    // to mock layout for this.
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowA, { dataTransfer });
    fireEvent.dragOver(rowB, { dataTransfer });
    fireEvent.drop(rowB, { dataTransfer });

    // optimistic apply is synchronous (`setItems` runs before the `await
    // reorderCategories(...)` line) — observable immediately, no waitFor.
    expect(document.querySelector('[data-cat-row="a"]')?.getAttribute('aria-level')).not.toBe(
      originalLevel,
    );

    // the POST rejects → rollback + error toast
    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument();
    expect(document.querySelector('[data-cat-row="a"]')?.getAttribute('aria-level')).toBe(
      originalLevel,
    );
  });

  it('a drag-reorder whose target vanished shows the reloaded-list toast, not an error — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce([cat('a', 'Alpha'), cat('b', 'Bravo')])
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404))
      .mockResolvedValue([cat('a', 'Alpha'), cat('b', 'Bravo')]);

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');
    const rowA = document.querySelector('[data-cat-row="a"]');
    const rowB = document.querySelector('[data-cat-row="b"]');
    if (!rowA || !rowB) throw new Error('expected both rows to render');

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(rowA, { dataTransfer });
    fireEvent.dragOver(rowB, { dataTransfer });
    fireEvent.drop(rowB, { dataTransfer });

    expect(await screen.findByText('The category list changed — reloaded.')).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
  });
});

describe('CategoryList — deep link from Audit Log (?status=all&highlight=categoryId)', () => {
  it('flashes the target row once the flat/all view has it, even when it is not on the first page', async () => {
    mockSearchParams = new URLSearchParams({ status: 'all', highlight: 'z' });
    mockedAdminApi
      .mockResolvedValueOnce([]) // #1 mount GET — the tree's own unconditional load
      .mockResolvedValueOnce({ data: [cat('a', 'Alpha')], meta: { nextCursor: 'c1' } }) // flat page 1
      .mockResolvedValueOnce({ data: [cat('z', 'Zulu')], meta: {} }); // flat page 2 — has the target

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Zulu');

    expect(document.querySelector('[data-cat-row="z"]')).toHaveClass('sn-row-flash');
  });

  it('without a highlight param, nothing flashes', async () => {
    mockSearchParams = new URLSearchParams({ status: 'all' });
    mockedAdminApi
      .mockResolvedValueOnce([]) // tree's own unconditional load
      .mockResolvedValueOnce({ data: [cat('a', 'Alpha')], meta: {} }); // flat page

    renderAdmin(<CategoryList />);
    await screen.findAllByText('Alpha');

    expect(document.querySelector('[data-cat-row="a"]')).not.toHaveClass('sn-row-flash');
  });
});
