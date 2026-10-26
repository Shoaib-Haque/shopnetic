import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { getSeller, listSellersPage, type SellerListPage } from './api';
import { SellerList } from './seller-list';

vi.mock('./api', () => ({
  listSellersPage: vi.fn(),
  getSeller: vi.fn(),
  updateSellerStatus: vi.fn(),
}));

const PATHNAME = '/en/x7f2k9t3m1qp/sellers';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => PATHNAME,
  useSearchParams: () => mockSearchParams,
}));

const mockedListSellersPage = vi.mocked(listSellersPage);
const mockedGetSeller = vi.mocked(getSeller);

function createSeller(id: string, overrides: Partial<SellerWithShop> = {}): SellerWithShop {
  return {
    id,
    accountId: `acc-${id}`,
    legalName: `Legal Name ${id}`,
    type: 'business',
    country: 'US',
    status: 'approved',
    commissionOverrideBps: null,
    reserveBps: null,
    deletedAt: null,
    accountEmail: `seller-${id}@example.com`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    shop: {
      id: `shop-${id}`,
      sellerId: id,
      slug: `shop-${id}`,
      displayName: `Shop Display ${id}`,
      description: `Description for ${id}`,
      logoUrl: null,
      bannerUrl: null,
      vacationUntil: null,
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function page(sellers: SellerWithShop[], nextCursor?: string): SellerListPage {
  return { sellers, nextCursor };
}

function tableRowFor(text: string): HTMLElement {
  const row = screen
    .getAllByText(text)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null);
  if (!row) throw new Error(`no table row found containing ${text}`);
  return row;
}

function openRowMenu(row: HTMLElement) {
  const trigger = within(row).getByRole('button', { name: 'More actions' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  mockedListSellersPage.mockReset();
  mockedGetSeller.mockReset();
  replaceStateSpy.mockRestore();
});

describe('SellerList', () => {
  it('renders initial table columns, data, and actions menu', async () => {
    const s1 = createSeller('1', {
      legalName: 'Acme International LLC',
      country: 'US',
      type: 'business',
      status: 'approved',
      accountEmail: 'billing@acme.com',
      shop: {
        id: 'sh-1',
        sellerId: '1',
        displayName: 'Acme Official',
        slug: 'acme-official',
        description: 'Prime ACME store',
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    mockedListSellersPage.mockResolvedValueOnce(page([s1]));

    renderAdmin(<SellerList />);

    // Header & Subtitle
    expect(await screen.findByText('Sellers')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Review applications, inspect shops, and manage marketplace seller statuses.',
      ),
    ).toBeInTheDocument();

    // Verify row data rendered
    const row = tableRowFor('Acme Official');
    expect(within(row).getByText('/acme-official')).toBeInTheDocument();
    expect(within(row).getByText('Acme International LLC')).toBeInTheDocument();
    expect(within(row).getByText('Business')).toBeInTheDocument();
    expect(within(row).getByText('US')).toBeInTheDocument();
    expect(within(row).getByText('Approved')).toBeInTheDocument();
    expect(within(row).getByText('billing@acme.com')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('filters by status tabs on desktop and refetches', async () => {
    const sInReview = createSeller('rev', { status: 'in_review' });
    mockedListSellersPage
      .mockResolvedValueOnce(page([createSeller('1', { status: 'approved' })]))
      .mockResolvedValueOnce(page([sInReview]));

    renderAdmin(<SellerList />);

    // Wait for initial mount
    expect((await screen.findAllByText('Shop Display 1')).length).toBeGreaterThan(0);
    expect(mockedListSellersPage).toHaveBeenCalledWith({
      status: undefined,
      limit: 25,
      cursor: undefined,
    });

    // Click "In review" desktop tab button
    const inReviewTab = screen.getByRole('button', { name: 'In review' });
    fireEvent.click(inReviewTab);

    expect((await screen.findAllByText('Shop Display rev')).length).toBeGreaterThan(0);
    expect(mockedListSellersPage).toHaveBeenLastCalledWith({
      status: 'in_review',
      limit: 25,
      cursor: undefined,
    });

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        window.history.state,
        '',
        `${PATHNAME}?tab=in_review`,
      );
    });
  });

  it('filters by status using mobile Select dropdown', async () => {
    const sSuspended = createSeller('susp', { status: 'suspended' });
    mockedListSellersPage
      .mockResolvedValueOnce(page([createSeller('1', { status: 'approved' })]))
      .mockResolvedValueOnce(page([sSuspended]));

    renderAdmin(<SellerList />);

    expect((await screen.findAllByText('Shop Display 1')).length).toBeGreaterThan(0);

    // Open mobile select
    const selectTrigger = screen.getByRole('combobox', { name: 'Status filter' });
    fireEvent.click(selectTrigger);

    // Pick "Suspended"
    fireEvent.click(screen.getByRole('option', { name: 'Suspended' }));

    expect((await screen.findAllByText('Shop Display susp')).length).toBeGreaterThan(0);
    expect(mockedListSellersPage).toHaveBeenLastCalledWith({
      status: 'suspended',
      limit: 25,
      cursor: undefined,
    });
  });

  it('triggers debounced server-side search via q parameter and syncs to URL', async () => {
    const s1 = createSeller('1', {
      legalName: 'Stark Industries',
      shop: {
        id: 'sh-1',
        sellerId: '1',
        displayName: 'Arc Reactor Shop',
        slug: 'arc-shop',
        description: null,
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const s2 = createSeller('2', {
      legalName: 'Wayne Enterprises',
      shop: {
        id: 'sh-2',
        sellerId: '2',
        displayName: 'Bat Cave Tech',
        slug: 'bat-tech',
        description: null,
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    mockedListSellersPage
      .mockResolvedValueOnce(page([s1, s2]))
      .mockResolvedValueOnce(page([s1]))
      .mockResolvedValueOnce(page([s1, s2]));

    renderAdmin(<SellerList />);

    expect((await screen.findAllByText('Arc Reactor Shop')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Bat Cave Tech')).length).toBeGreaterThan(0);

    // Type query matching Stark / Arc
    const searchInput = screen.getByPlaceholderText('Search shop name, slug, legal name, email…');
    fireEvent.change(searchInput, { target: { value: 'Reactor' } });

    // Server is called with q: 'Reactor'
    await waitFor(() => {
      expect(mockedListSellersPage).toHaveBeenLastCalledWith({
        status: undefined,
        limit: 25,
        cursor: undefined,
        q: 'Reactor',
      });
    });

    // s1 should remain visible, s2 filtered out
    await waitFor(() => {
      expect(screen.queryByText('Bat Cave Tech')).not.toBeInTheDocument();
      expect(screen.getAllByText('Arc Reactor Shop').length).toBeGreaterThan(0);
    });

    // URL syncs
    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        window.history.state,
        '',
        `${PATHNAME}?q=Reactor`,
      );
    });

    // Clear search
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    await waitFor(() => {
      expect(mockedListSellersPage).toHaveBeenLastCalledWith({
        status: undefined,
        limit: 25,
        cursor: undefined,
        q: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('Bat Cave Tech').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Arc Reactor Shop').length).toBeGreaterThan(0);
    });
  });

  it('shows empty filter state when server search returns zero results', async () => {
    const s1 = createSeller('1');
    mockedListSellersPage.mockResolvedValueOnce(page([s1])).mockResolvedValueOnce(page([]));

    renderAdmin(<SellerList />);

    expect((await screen.findAllByText('Shop Display 1')).length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText('Search shop name, slug, legal name, email…');
    fireEvent.change(searchInput, { target: { value: 'nonexistent-query-xyz' } });

    await waitFor(() => {
      expect(mockedListSellersPage).toHaveBeenLastCalledWith({
        status: undefined,
        limit: 25,
        cursor: undefined,
        q: 'nonexistent-query-xyz',
      });
    });

    expect(await screen.findByText('No sellers match the selected filter.')).toBeInTheDocument();
  });

  it('opens SellerInspectModal when clicking Inspect from row menu', async () => {
    const s1 = createSeller('1', {
      legalName: 'Oscorp Laboratories',
      shop: {
        id: 'sh-1',
        sellerId: '1',
        displayName: 'Oscorp Tech',
        slug: 'oscorp-tech',
        description: 'Advanced science solutions',
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    mockedListSellersPage.mockResolvedValueOnce(page([s1]));

    renderAdmin(<SellerList />);

    await screen.findAllByText('Oscorp Tech');
    const row = tableRowFor('Oscorp Tech');

    openRowMenu(row);

    const inspectItem = await screen.findByRole('menuitem', { name: /inspect & moderate/i });
    fireEvent.click(inspectItem);

    // Modal opens
    expect(await screen.findByText('Seller Details & Moderation')).toBeInTheDocument();
    expect(screen.getByText('Advanced science solutions')).toBeInTheDocument();
  });

  it('provides direct link to audit log in row menu', async () => {
    const s1 = createSeller('sel-audit-1');
    mockedListSellersPage.mockResolvedValueOnce(page([s1]));

    renderAdmin(<SellerList locale="en" basePath="x7f2k9t3m1qp" />);

    await screen.findAllByText('Shop Display sel-audit-1');
    const row = tableRowFor('Shop Display sel-audit-1');

    openRowMenu(row);

    const auditMenuItem = await screen.findByRole('menuitem', { name: /view audit events/i });
    expect(auditMenuItem).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/audit-log?targetId=sel-audit-1&targetType=seller',
    );
  });

  it('spotlight pins targeted seller when ?target=<id> is in URL', async () => {
    mockSearchParams = new URLSearchParams({ target: 'target-seller-99' });

    const organicSeller = createSeller('organic-1');
    const targetedSeller = createSeller('target-seller-99', {
      legalName: 'Targeted VIP Seller',
      shop: {
        id: 'sh-target',
        sellerId: 'target-seller-99',
        displayName: 'Targeted VIP Shop',
        slug: 'vip-shop',
        description: 'Targeted shop',
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    mockedListSellersPage.mockResolvedValueOnce(page([organicSeller]));
    mockedGetSeller.mockResolvedValueOnce(targetedSeller);

    renderAdmin(<SellerList />);

    // Targeted seller is fetched and pinned
    expect((await screen.findAllByText('Targeted VIP Shop')).length).toBeGreaterThan(0);
    expect(mockedGetSeller).toHaveBeenCalledWith('target-seller-99');

    // Both targeted and organic are in the list
    expect(screen.getAllByText('Shop Display organic-1').length).toBeGreaterThan(0);

    const targetRow = tableRowFor('Targeted VIP Shop');
    expect(targetRow).toHaveClass('bg-primary/5');
  });

  it('shows error card on initial fetch failure, retry re-invokes fetch', async () => {
    mockedListSellersPage
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(page([createSeller('1')]));

    renderAdmin(<SellerList />);

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect((await screen.findAllByText('Shop Display 1')).length).toBeGreaterThan(0);
    expect(mockedListSellersPage).toHaveBeenCalledTimes(2);
  });

  it('infinite scroll: scrolling sentinel triggers next page fetch', async () => {
    const s1 = createSeller('1');
    const s2 = createSeller('2');

    mockedListSellersPage
      .mockResolvedValueOnce(page([s1], 'cursor-page-2'))
      .mockResolvedValueOnce(page([s2], undefined));

    renderAdmin(<SellerList />);

    await screen.findAllByText('Shop Display 1');
    expect(screen.queryByText('Shop Display 2')).not.toBeInTheDocument();

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => {
      triggerIntersection(sentinel);
    });

    await screen.findAllByText('Shop Display 2');
    expect(mockedListSellersPage).toHaveBeenCalledWith({
      status: undefined,
      limit: 25,
      cursor: 'cursor-page-2',
    });
    expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
  });
});
