import { afterEach, describe, expect, it, vi } from 'vitest';
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
