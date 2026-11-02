import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { listSellersPage } from '@/features/sellers/api';
import { formatSellerLabel, SellerCombobox, type SellerComboboxProps } from './seller-combobox';

vi.mock('@/features/sellers/api', () => ({
  listSellersPage: vi.fn(),
}));

const mockedListSellersPage = vi.mocked(listSellersPage);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const acmeSeller: SellerWithShop = {
  id: 'seller_acme',
  accountId: 'acc_acme',
  legalName: 'Acme Apparel LLC',
  type: 'business',
  country: 'US',
  status: 'approved',
  commissionOverrideBps: null,
  reserveBps: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  shop: {
    id: 'shop_acme',
    sellerId: 'seller_acme',
    slug: 'acme-apparel',
    displayName: 'Acme Apparel',
    description: 'High quality apparel',
    logoUrl: null,
    bannerUrl: null,
    vacationUntil: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
};

const shopneticSeller: SellerWithShop = {
  id: 'seller_1p',
  accountId: 'acc_1p',
  legalName: 'Shopnetic Retail Inc.',
  type: 'business',
  country: 'US',
  status: 'approved',
  commissionOverrideBps: null,
  reserveBps: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  shop: {
    id: 'shop_1p',
    sellerId: 'seller_1p',
    slug: 'shopnetic-retail',
    displayName: 'Shopnetic Retail',
    description: '1P retail storefront',
    logoUrl: null,
    bannerUrl: null,
    vacationUntil: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
};

/** Seller with no shop (fallback to legalName + id handle) */
const noShopSeller: SellerWithShop = {
  id: 'abcdef12',
  accountId: 'acc_noshop',
  legalName: 'No Shop Seller',
  type: 'individual',
  country: 'US',
  status: 'approved',
  commissionOverrideBps: null,
  reserveBps: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  shop: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCombobox(overrides: Partial<SellerComboboxProps> = {}) {
  const defaults: SellerComboboxProps = {
    value: '',
    onChange: vi.fn(),
    sellers: [acmeSeller, shopneticSeller],
  };
  return renderAdmin(<SellerCombobox {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// formatSellerLabel unit tests
// ---------------------------------------------------------------------------

describe('formatSellerLabel', () => {
  it('marks seller with shopnetic-retail slug as 1P', () => {
    const label = formatSellerLabel(shopneticSeller);
    expect(label.tag).toBe('1P');
    expect(label.name).toBe('Shopnetic Retail');
    expect(label.fullText).toBe('Shopnetic Retail (1P)');
  });

  it('marks any other seller as 3P', () => {
    const label = formatSellerLabel(acmeSeller);
    expect(label.tag).toBe('3P');
    expect(label.name).toBe('Acme Apparel');
    expect(label.fullText).toBe('Acme Apparel (3P)');
  });

  it('falls back to legalName when seller has no shop', () => {
    const label = formatSellerLabel(noShopSeller);
    expect(label.tag).toBe('3P');
    expect(label.name).toBe('No Shop Seller');
    expect(label.fullText).toBe('No Shop Seller (3P)');
  });

  it('formats seller id fallback when seller has no shop or legalName', () => {
    const longIdSeller: SellerWithShop = {
      ...noShopSeller,
      legalName: '',
      id: '12345678-abcd-ef01-2345-6789abcdef01',
    };
    const label = formatSellerLabel(longIdSeller);
    expect(label.name).toBe('12345678-abcd-ef01-2345-6789abcdef01');
    expect(label.fullText).toBe('12345678-abcd-ef01-2345-6789abcdef01 (3P)');
  });
});

// ---------------------------------------------------------------------------
// SellerCombobox component tests
// ---------------------------------------------------------------------------

describe('SellerCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListSellersPage.mockImplementation(async (opts) => {
      let list = [acmeSeller, shopneticSeller];
      if (opts?.q) {
        const q = opts.q.toLowerCase();
        list = list.filter(
          (s) =>
            s.shop?.displayName.toLowerCase().includes(q) ||
            s.shop?.slug.toLowerCase().includes(q) ||
            s.legalName.toLowerCase().includes(q),
        );
      }
      return { sellers: list, nextCursor: undefined };
    });
  });

  afterEach(() => {
    cleanup();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  describe('Rendering', () => {
    it('renders a combobox trigger with role="combobox" and default aria-label "Seller"', () => {
      renderCombobox();
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows placeholder when no value is selected', () => {
      renderCombobox({ value: '', placeholder: 'Select seller…' });
      expect(screen.getByText('Select seller…')).toBeInTheDocument();
    });

    it('shows selected seller fullText when a value is set', () => {
      renderCombobox({ value: 'seller_acme' });
      expect(screen.getByText('Acme Apparel (3P)')).toBeInTheDocument();
    });

    it('renders trigger as disabled when disabled=true', () => {
      renderCombobox({ disabled: true });
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      expect(trigger).toBeDisabled();
    });

    it('applies destructive border class when invalid=true', () => {
      renderCombobox({ invalid: true });
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      expect(trigger.className).toContain('border-destructive');
    });

    it('accepts custom ariaLabel prop', () => {
      renderCombobox({ ariaLabel: 'Assign Seller' });
      expect(screen.getByRole('combobox', { name: 'Assign Seller' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Open / close behavior
  // -------------------------------------------------------------------------
  describe('Popover open/close', () => {
    it('opens the popover with listbox and search input on trigger click', async () => {
      renderCombobox();
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search sellers…')).toBeInTheDocument();
      });

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('renders all seller options when popover is open', async () => {
      renderCombobox();
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      expect(screen.getByRole('option', { name: 'Acme Apparel (3P)' })).toBeInTheDocument();
      // Displays distinct legal name as secondary confirmation text
      expect(screen.getByText('Acme Apparel LLC')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Shopnetic Retail (1P)' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------
  describe('Option selection', () => {
    it('calls onChange with the selected seller id and closes popover', async () => {
      const onChange = vi.fn();
      renderCombobox({ onChange });

      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const option = screen.getByRole('option', { name: 'Acme Apparel (3P)' });
      fireEvent.click(option);

      expect(onChange).toHaveBeenCalledWith('seller_acme');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('marks the currently selected option with aria-selected="true"', async () => {
      renderCombobox({ value: 'seller_acme' });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const selected = screen.getByRole('option', {
        name: 'Acme Apparel (3P)',
      });
      expect(selected).toHaveAttribute('aria-selected', 'true');

      const unselected = screen.getByRole('option', {
        name: 'Shopnetic Retail (1P)',
      });
      expect(unselected).toHaveAttribute('aria-selected', 'false');
    });
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------
  describe('Search filtering', () => {
    it('filters sellers by name', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: 'acme' },
      });

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Acme Apparel (3P)' })).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Shopnetic Retail (1P)' }),
        ).not.toBeInTheDocument();
      });
    });

    it('filters sellers by slug handle', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: 'shopnetic' },
      });

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Shopnetic Retail (1P)' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Acme Apparel (3P)' })).not.toBeInTheDocument();
      });
    });

    it('filters sellers by legalName', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: 'retail inc' },
      });

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Shopnetic Retail (1P)' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Acme Apparel (3P)' })).not.toBeInTheDocument();
      });
    });

    it('is case-insensitive when filtering', async () => {
      renderCombobox({ sellers: [acmeSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: 'ACME' },
      });

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Acme Apparel (3P)' })).toBeInTheDocument();
      });
    });

    it('shows "No sellers found" when no options match', async () => {
      renderCombobox({ sellers: [acmeSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: 'zzz_no_match' },
      });

      await waitFor(() => {
        expect(screen.getByText('No sellers found')).toBeInTheDocument();
      });
    });

    it('shows all sellers when search query is empty', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');
      fireEvent.change(searchInput, { target: { value: 'acme' } });
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getAllByRole('option').length).toBe(2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Empty sellers list
  // -------------------------------------------------------------------------
  describe('Empty sellers list', () => {
    it('shows "No sellers found" immediately when sellers array is empty', async () => {
      mockedListSellersPage.mockResolvedValueOnce({ sellers: [], nextCursor: undefined });
      renderCombobox({ sellers: [] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      await waitFor(() => {
        expect(screen.getByText('No sellers found')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  describe('Keyboard navigation and auto-scroll', () => {
    it('navigates options via ArrowDown and ArrowUp and selects via Enter', async () => {
      const onChange = vi.fn();
      renderCombobox({ sellers: [acmeSeller, shopneticSeller], onChange });

      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');

      // Arrow down to first item
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      // Arrow down to second item
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      // Enter to select
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith('seller_1p');
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('closes popover on Escape', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Pagination & Infinite Scroll (useScrollLoad)
  // -------------------------------------------------------------------------
  describe('Pagination & Infinite Scroll', () => {
    it('requests initial page with limit=50 and undefined cursor on open', async () => {
      renderCombobox();
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      await waitFor(() => {
        expect(mockedListSellersPage).toHaveBeenCalledWith(
          expect.objectContaining({
            cursor: undefined,
            limit: 50,
            status: 'approved',
          }),
        );
      });
    });

    it('appends page 2 when sentinel intersects and passes cursor without duplicate rows', async () => {
      const sellerPage2: SellerWithShop = {
        ...acmeSeller,
        id: 'seller_page2',
        accountId: 'acc_page2',
        legalName: 'Second Page Merchant LLC',
        shop: {
          ...acmeSeller.shop!,
          id: 'shop_page2',
          sellerId: 'seller_page2',
          slug: 'second-page',
          displayName: 'Second Page Merchant',
        },
      };

      mockedListSellersPage.mockImplementation(async (opts) => {
        if (opts?.cursor === 'next_page_cursor') {
          return { sellers: [sellerPage2], nextCursor: undefined };
        }
        return { sellers: [acmeSeller], nextCursor: 'next_page_cursor' };
      });

      renderCombobox({ sellers: [] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      // Wait for page 1 to load
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Acme Apparel (3P)' })).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('option', { name: 'Second Page Merchant (3P)' }),
      ).not.toBeInTheDocument();

      // Trigger sentinel visibility
      const sentinel = screen.getByTestId('seller-combobox-sentinel');
      act(() => {
        triggerIntersection(sentinel, true);
      });

      // Page 2 should be appended
      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: 'Second Page Merchant (3P)' }),
        ).toBeInTheDocument();
      });

      // Page 1 is still present
      expect(screen.getByRole('option', { name: 'Acme Apparel (3P)' })).toBeInTheDocument();

      // Verified called with cursor and query
      expect(mockedListSellersPage).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: 'next_page_cursor',
          limit: 50,
        }),
      );
    });

    it('clamps ArrowDown at the boundary of currently loaded items', async () => {
      const onChange = vi.fn();
      renderCombobox({ sellers: [acmeSeller, shopneticSeller], onChange });

      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');

      // Navigate down to item 0, item 1 (last loaded item), and attempt exceeding boundary
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

      // Enter to select — should select the clamped last loaded item (Shopnetic Retail)
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith('seller_1p');
    });
  });
});
