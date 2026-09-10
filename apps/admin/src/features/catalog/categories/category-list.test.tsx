import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Category } from '@shopnetic/contracts';
import { adminApi, AdminApiError } from '@/features/admin-api/client';
import { renderAdmin } from '@/test/render';
import { CategoryList } from './category-list';

vi.mock('@/features/admin-api/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/admin-api/client')>(
    '@/features/admin-api/client',
  );
  return { ...actual, adminApi: vi.fn() };
});

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
});
