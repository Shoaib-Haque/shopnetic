import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { formatSellerLabel, SellerCombobox, type SellerComboboxProps } from './seller-combobox';

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
    expect(label.handle).toBe('@shopnetic-retail');
    expect(label.fullText).toBe('Shopnetic Retail (1P) • @shopnetic-retail');
  });

  it('marks any other seller as 3P', () => {
    const label = formatSellerLabel(acmeSeller);
    expect(label.tag).toBe('3P');
    expect(label.name).toBe('Acme Apparel');
    expect(label.handle).toBe('@acme-apparel');
    expect(label.fullText).toBe('Acme Apparel (3P) • @acme-apparel');
  });

  it('falls back to legalName and #id[:8] handle when seller has no shop', () => {
    const label = formatSellerLabel(noShopSeller);
    expect(label.tag).toBe('3P');
    expect(label.name).toBe('No Shop Seller');
    expect(label.handle).toBe('#abcdef12'); // id is 8 chars, slice(0,8) = full id
    expect(label.fullText).toBe('No Shop Seller (3P) • #abcdef12');
  });

  it('slices seller id to 8 chars for the handle fallback when seller has no shop', () => {
    const longIdSeller: SellerWithShop = {
      ...noShopSeller,
      id: '12345678-abcd-ef01-2345-6789abcdef01',
    };
    const label = formatSellerLabel(longIdSeller);
    expect(label.name).toBe('No Shop Seller');
    expect(label.handle).toBe('#12345678');
    expect(label.fullText).toBe('No Shop Seller (3P) • #12345678');
  });
});

// ---------------------------------------------------------------------------
// SellerCombobox component tests
// ---------------------------------------------------------------------------

describe('SellerCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(screen.getByText('Acme Apparel (3P) • @acme-apparel')).toBeInTheDocument();
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

      expect(
        screen.getByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Shopnetic Retail (1P) • @shopnetic-retail' }),
      ).toBeInTheDocument();
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

      const option = screen.getByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' });
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
        name: 'Acme Apparel (3P) • @acme-apparel',
      });
      expect(selected).toHaveAttribute('aria-selected', 'true');

      const unselected = screen.getByRole('option', {
        name: 'Shopnetic Retail (1P) • @shopnetic-retail',
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
        expect(
          screen.getByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Shopnetic Retail (1P) • @shopnetic-retail' }),
        ).not.toBeInTheDocument();
      });
    });

    it('filters sellers by slug handle', async () => {
      renderCombobox({ sellers: [acmeSeller, shopneticSeller] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search sellers…'), {
        target: { value: '@shopnetic' },
      });

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: 'Shopnetic Retail (1P) • @shopnetic-retail' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
        ).not.toBeInTheDocument();
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
        expect(
          screen.getByRole('option', { name: 'Shopnetic Retail (1P) • @shopnetic-retail' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
        ).not.toBeInTheDocument();
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
        expect(
          screen.getByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
        ).toBeInTheDocument();
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
      renderCombobox({ sellers: [] });
      fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));

      await waitFor(() => {
        expect(screen.getByText('No sellers found')).toBeInTheDocument();
      });
    });
  });
});
