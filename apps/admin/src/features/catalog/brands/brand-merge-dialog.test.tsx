import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { AdminApiError } from '@/features/admin-api/client';
import { listBrandsPage, mergeBrand } from './api';
import { BrandMergeDialog } from './brand-merge-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, listBrandsPage: vi.fn(), mergeBrand: vi.fn() };
});

const mockedListBrandsPage = vi.mocked(listBrandsPage);
const mockedMergeBrand = vi.mocked(mergeBrand);

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

const source = brand('source1', 'Source Brand');

afterEach(() => {
  cleanup();
  mockedListBrandsPage.mockReset();
  mockedMergeBrand.mockReset();
});

describe('BrandMergeDialog', () => {
  it('excludes the source brand from its own target list', async () => {
    mockedListBrandsPage.mockResolvedValueOnce({
      brands: [source, brand('t1', 'Target One')],
      nextCursor: undefined,
    });

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={vi.fn()} />,
    );

    expect(await screen.findByText('Target One')).toBeInTheDocument();
    expect(screen.queryByText('Source Brand')).not.toBeInTheDocument();
  });

  it('an empty result set shows the no-matches message', async () => {
    mockedListBrandsPage.mockResolvedValueOnce({ brands: [], nextCursor: undefined });

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={vi.fn()} />,
    );

    expect(await screen.findByText('No matching brands.')).toBeInTheDocument();
  });

  it('typing a query re-fetches with q, server-side (debounced)', async () => {
    mockedListBrandsPage.mockResolvedValueOnce({
      brands: [brand('t1', 'Target One')],
      nextCursor: undefined,
    });
    mockedListBrandsPage.mockResolvedValueOnce({
      brands: [brand('t2', 'Zephyr')],
      nextCursor: undefined,
    });

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={vi.fn()} />,
    );
    await screen.findByText('Target One');

    fireEvent.change(screen.getByPlaceholderText('Search for the surviving brand…'), {
      target: { value: 'zeph' },
    });

    expect(await screen.findByText('Zephyr', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('Target One')).not.toBeInTheDocument();
    expect(mockedListBrandsPage).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'zeph' }));
  });

  it('selecting a target highlights it and enables Merge; confirming posts the merge and reports the target back', async () => {
    const onMerged = vi.fn();
    const target = brand('t1', 'Target One');
    mockedListBrandsPage.mockResolvedValueOnce({ brands: [target], nextCursor: undefined });
    mockedMergeBrand.mockResolvedValueOnce(target);

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={onMerged} />,
    );

    const row = await screen.findByRole('button', { name: /Target One/ });
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();

    fireEvent.click(row);
    expect(row).toHaveClass('bg-muted');
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(target));
    expect(mockedMergeBrand).toHaveBeenCalledWith('source1', { intoBrandId: 't1' });
  });

  it('a failed merge shows an inline error and leaves the dialog open for another try', async () => {
    const target = brand('t1', 'Target One');
    mockedListBrandsPage.mockResolvedValueOnce({ brands: [target], nextCursor: undefined });
    mockedMergeBrand.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));
    const onOpenChange = vi.fn();

    renderAdmin(
      <BrandMergeDialog open onOpenChange={onOpenChange} source={source} onMerged={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Target One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(
      await screen.findByText(
        'That action conflicts with the current state — reload and try again.',
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Cancel is disabled while a merge is in flight', async () => {
    const target = brand('t1', 'Target One');
    mockedListBrandsPage.mockResolvedValueOnce({ brands: [target], nextCursor: undefined });
    let resolveMerge!: (b: Brand) => void;
    mockedMergeBrand.mockReturnValueOnce(new Promise((resolve) => (resolveMerge = resolve)));

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Target One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    // two "Cancel"-named elements exist (the footer button, and the dialog's
    // own X close icon via `aria-label`) — `getByText` disambiguates to the
    // one with visible "Cancel" text.
    await waitFor(() => expect(screen.getByText('Cancel')).toBeDisabled());
    resolveMerge(target);
  });

  it('loads more results past the first page instead of hard-capping at it', async () => {
    mockedListBrandsPage.mockResolvedValueOnce({
      brands: [brand('t1', 'Bravo')],
      nextCursor: 'c1',
    });
    mockedListBrandsPage.mockResolvedValueOnce({
      brands: [brand('t2', 'Charlie')],
      nextCursor: undefined,
    });

    renderAdmin(
      <BrandMergeDialog open onOpenChange={vi.fn()} source={source} onMerged={vi.fn()} />,
    );

    await screen.findByText('Bravo');
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();

    triggerIntersection(await screen.findByTestId('scroll-sentinel'));
    expect(await screen.findByText('Charlie')).toBeInTheDocument();
  });
});
