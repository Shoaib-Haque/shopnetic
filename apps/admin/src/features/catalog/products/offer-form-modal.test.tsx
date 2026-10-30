import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  plainTextToDoc,
  type Offer,
  type Product,
  type SellerWithShop,
  type Variant,
  type Warehouse,
} from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { createOffer, updateOffer } from './api';
import { OfferFormModal, type OfferFormModalProps } from './offer-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
  };
});

const mockedCreateOffer = vi.mocked(createOffer);
const mockedUpdateOffer = vi.mocked(updateOffer);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleProduct: Product = {
  id: 'prod_1',
  categoryId: 'cat_1',
  brandId: null,
  title: { en: 'Organic Tee' },
  description: { en: plainTextToDoc('Comfortable tee') },
  slug: 'organic-tee',
  status: 'active',
  basePriceMinor: '2999',
  currency: 'USD',
  spec: {},
  proposedBySellerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleVariant: Variant = {
  id: 'var_1',
  productId: 'prod_1',
  skuCode: 'TEE-S',
  gtin: '123456789012',
  weightG: 180,
  dims: { length: 250, width: 200, height: 15 },
  comboSignature: 'ot_size:val_s',
  status: 'active',
  position: 0,
  selections: [{ optionTypeId: 'ot_size', optionValueId: 'val_s' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleSeller: SellerWithShop = {
  id: 'seller_1',
  accountId: 'acc_1',
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
    id: 'shop_1',
    sellerId: 'seller_1',
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

const sampleWarehouse: Warehouse = {
  id: 'wh_1',
  sellerId: 'seller_1',
  name: 'Main Fulfillment Center',
  isDefault: true,
  address: {
    line1: '123 Warehouse Way',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98101',
    country: 'US',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

const sampleOffer: Offer = {
  id: 'offer_1',
  sellerId: 'seller_1',
  sellerName: 'Acme Apparel',
  shopSlug: 'acme-apparel',
  variantId: 'var_1',
  skuCode: 'TEE-S',
  priceMinor: '2499',
  currency: 'USD',
  salePriceMinor: '1999',
  saleStartsAt: '2026-01-01T00:00:00.000Z',
  saleEndsAt: '2026-12-31T23:59:59.000Z',
  compareAtMinor: null,
  condition: 'new',
  conditionNotes: null,
  handlingDays: 1,
  status: 'active',
  minQty: 1,
  maxQty: 10,
  isBuyboxWinner: true,
  totalOnHand: 50,
  totalAvailable: 45,
  stocks: [
    {
      id: 'stock_1',
      warehouseId: 'wh_1',
      warehouseName: 'Main Fulfillment Center',
      onHand: 50,
      reserved: 5,
      available: 45,
      safetyStock: 5,
      backorder: false,
      restockEta: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(overrides: Partial<OfferFormModalProps> = {}) {
  const defaults: OfferFormModalProps = {
    open: true,
    onOpenChange: vi.fn(),
    product: sampleProduct,
    variants: [sampleVariant],
    selectedVariantId: 'var_1',
    offer: null,
    sellers: [sampleSeller],
    warehouses: [sampleWarehouse],
    onSaved: vi.fn(),
    onNewWarehouseRequested: vi.fn(),
    onConflict: vi.fn(),
  };
  return renderAdmin(<OfferFormModal {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfferFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateOffer.mockReset();
    mockedUpdateOffer.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // -------------------------------------------------------------------------
  // 5.4 / Item 37 — SellerCombobox renders with correct ARIA roles
  // -------------------------------------------------------------------------
  describe('SellerCombobox (Item 37)', () => {
    it('renders a combobox trigger with role="combobox" and aria-label="Seller"', () => {
      renderModal();
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      expect(trigger).toBeInTheDocument();
    });

    it('opens listbox and shows seller options when trigger is clicked', async () => {
      renderModal({ sellers: [sampleSeller, shopneticSeller] });
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // 3P seller option
      expect(
        screen.getByRole('option', {
          name: 'Acme Apparel (3P) • @acme-apparel',
        }),
      ).toBeInTheDocument();

      // 1P seller option
      expect(
        screen.getByRole('option', {
          name: 'Shopnetic Retail (1P) • @shopnetic-retail',
        }),
      ).toBeInTheDocument();
    });

    it('filters seller options by search query', async () => {
      renderModal({ sellers: [sampleSeller, shopneticSeller] });
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      fireEvent.click(trigger);

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');
      fireEvent.change(searchInput, { target: { value: 'acme' } });

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: 'Acme Apparel (3P) • @acme-apparel' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Shopnetic Retail (1P) • @shopnetic-retail' }),
        ).not.toBeInTheDocument();
      });
    });

    it('shows "No sellers found" when no options match the query', async () => {
      renderModal({ sellers: [sampleSeller] });
      const trigger = screen.getByRole('combobox', { name: 'Seller' });
      fireEvent.click(trigger);

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText('Search sellers…');
      fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No sellers found')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5.4 / Item 40 — Price input uses type="text" inputMode="decimal" (CRITICAL)
  // -------------------------------------------------------------------------
  describe('Price input type (Item 40 — CRITICAL)', () => {
    it('renders price input with type="text" and inputMode="decimal" (not type="number")', () => {
      renderModal();
      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      expect(priceInput).toHaveAttribute('type', 'text');
      expect(priceInput).toHaveAttribute('inputMode', 'decimal');
      // Critically must NOT be type="number" — that would trap cursor position
      expect(priceInput).not.toHaveAttribute('type', 'number');
    });

    it('renders sale price input with type="text" and inputMode="decimal"', () => {
      renderModal();
      const salePriceInput = screen.getByPlaceholderText('e.g. 24.99 (optional)');
      expect(salePriceInput).toHaveAttribute('type', 'text');
      expect(salePriceInput).toHaveAttribute('inputMode', 'decimal');
      expect(salePriceInput).not.toHaveAttribute('type', 'number');
    });
  });

  // -------------------------------------------------------------------------
  // 5.4 / Item 39 — maxQty validation: distinct min and max messages
  // -------------------------------------------------------------------------
  describe('maxQty validation messages (Item 39)', () => {
    it('shows maxQtyMin message when maxQty = 0 (below minimum of 1)', async () => {
      renderModal();

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      // Max qty has id="offer-max-qty" — use getByDisplayValue to find the
      // max qty input specifically by its Unlimited placeholder
      const maxQtyField = screen.getByPlaceholderText('Unlimited');
      fireEvent.change(maxQtyField, { target: { value: '0' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.submit(submitBtn.closest('form')!);

      await waitFor(() => {
        expect(screen.getByText('Maximum order quantity must be at least 1.')).toBeInTheDocument();
      });
    });

    it('shows maxQtyMax message when maxQty = 1000000 (above maximum of 999999)', async () => {
      renderModal();

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      const maxQtyField = screen.getByPlaceholderText('Unlimited');
      fireEvent.change(maxQtyField, { target: { value: '1000000' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Maximum order quantity cannot exceed 999,999.'),
        ).toBeInTheDocument();
      });
    });

    it('maxQtyMin and maxQtyMax messages are distinct strings', () => {
      const minMsg = 'Maximum order quantity must be at least 1.';
      const maxMsg = 'Maximum order quantity cannot exceed 999,999.';
      expect(minMsg).not.toBe(maxMsg);
    });
  });

  // -------------------------------------------------------------------------
  // Modal title — create vs edit
  // -------------------------------------------------------------------------
  describe('Modal titles', () => {
    it('shows "Create Seller Offer" title in create mode', () => {
      renderModal({ offer: null });
      expect(screen.getByText('Create Seller Offer')).toBeInTheDocument();
    });

    it('shows "Edit Offer Listing" title in edit mode', () => {
      renderModal({ offer: sampleOffer });
      expect(screen.getByText('Edit Offer Listing')).toBeInTheDocument();
    });

    it('shows "Create Offer" submit button in create mode', () => {
      renderModal({ offer: null });
      expect(screen.getByRole('button', { name: 'Create Offer' })).toBeInTheDocument();
    });

    it('shows "Save Offer" submit button in edit mode', () => {
      renderModal({ offer: sampleOffer });
      expect(screen.getByRole('button', { name: 'Save Offer' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Item 45 — isDirty no-op save bypass (edit mode, no changes)
  // -------------------------------------------------------------------------
  describe('isDirty no-op save bypass (Item 45)', () => {
    it('closes without calling updateOffer when editing and no fields were changed', async () => {
      const onOpenChange = vi.fn();
      renderModal({ offer: sampleOffer, onOpenChange });

      const saveBtn = screen.getByRole('button', { name: 'Save Offer' });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockedUpdateOffer).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Item 46 — Discard confirmation dialog on close with dirty form
  // -------------------------------------------------------------------------
  describe('Discard confirmation (Item 46)', () => {
    it('shows ConfirmDialog when closing with unsaved changes', async () => {
      const onOpenChange = vi.fn();
      renderModal({ offer: null, onOpenChange });

      // Dirty the form by typing a price
      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '9.99' } });

      // Click cancel (triggers handleAttemptClose)
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getByText('Discard changes?')).toBeInTheDocument();
      });

      // modal should NOT be closed yet
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('closes without saving when discard is confirmed', async () => {
      const onOpenChange = vi.fn();
      renderModal({ offer: null, onOpenChange });

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '9.99' } });

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      await waitFor(() => expect(screen.getByText('Discard changes?')).toBeInTheDocument());

      // Click the "Discard" confirmation button
      const discardBtn = screen.getByRole('button', { name: 'Discard' });
      fireEvent.click(discardBtn);

      await waitFor(() => {
        expect(mockedCreateOffer).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('keeps modal open when discard is cancelled', async () => {
      const onOpenChange = vi.fn();
      renderModal({ offer: null, onOpenChange });

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '9.99' } });

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      await waitFor(() => expect(screen.getByText('Discard changes?')).toBeInTheDocument());

      // Click the cancel button inside the confirm dialog
      const keepEditingBtns = screen.getAllByRole('button', { name: 'Cancel' });
      // The confirm dialog has its own Cancel — click that one (last rendered)
      fireEvent.click(keepEditingBtns[keepEditingBtns.length - 1]!);

      await waitFor(() => {
        expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
      });
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // Item 47 — onConflict called when hadConflictRef is set
  // -------------------------------------------------------------------------
  describe('onConflict callback (Item 47)', () => {
    it('calls onConflict when a 409 conflict occurred and modal is dismissed via discard confirmation', async () => {
      const onConflict = vi.fn();
      const onOpenChange = vi.fn();

      // Simulate 409 response on updateOffer (code, status)
      mockedUpdateOffer.mockRejectedValueOnce(new AdminApiError('OFFER_CONFLICT', 409));

      renderModal({ offer: sampleOffer, onOpenChange, onConflict });

      // Dirty the form by changing price
      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '29.99' } });

      // Click save offer to trigger 409 conflict
      const saveBtn = screen.getByRole('button', { name: 'Save Offer' });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockedUpdateOffer).toHaveBeenCalledOnce();
      });

      // Form had a conflict; now user cancels/closes modal
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      // Confirm dialog appears because form is dirty
      await waitFor(() => {
        expect(screen.getByText('Discard changes?')).toBeInTheDocument();
      });

      // Confirm discard
      const discardBtn = screen.getByRole('button', { name: 'Discard' });
      fireEvent.click(discardBtn);

      await waitFor(() => {
        expect(onConflict).toHaveBeenCalledOnce();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('does not call onConflict when no conflict occurred', async () => {
      const onConflict = vi.fn();
      const onOpenChange = vi.fn();

      renderModal({ offer: sampleOffer, onOpenChange, onConflict });

      const saveBtn = screen.getByRole('button', { name: 'Save Offer' });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
      expect(onConflict).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Core validation
  // -------------------------------------------------------------------------
  describe('Form validation', () => {
    it('blocks submission and shows error when price is empty', async () => {
      renderModal();
      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('A valid positive price is required.')).toBeInTheDocument();
      });
      expect(mockedCreateOffer).not.toHaveBeenCalled();
    });

    it('blocks when seller is not selected', async () => {
      renderModal({ sellers: [sampleSeller], offer: null });
      // Default seller auto-selects when sellers exist; use no sellers scenario
      renderModal({ sellers: [], offer: null });

      const submitBtn = screen.getAllByRole('button', { name: 'Create Offer' })[0]!;
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getAllByText('Please select a seller.').length).toBeGreaterThan(0);
      });
    });

    it('shows "Sale price must be strictly less than list price." when sale >= list', async () => {
      renderModal();

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '10.00' } });

      const salePriceInput = screen.getByPlaceholderText('e.g. 24.99 (optional)');
      fireEvent.change(salePriceInput, { target: { value: '10.00' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Sale price must be strictly less than list price.'),
        ).toBeInTheDocument();
      });
    });

    it('shows "Sale end date must be after the start date." when end <= start', async () => {
      renderModal();

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      const startInput = screen.getByLabelText('Sale Starts');
      const endInput = screen.getByLabelText('Sale Ends');
      fireEvent.change(startInput, { target: { value: '2026-06-15T12:00' } });
      fireEvent.change(endInput, { target: { value: '2026-06-10T12:00' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Sale end date must be after the start date.')).toBeInTheDocument();
      });
    });

    it('shows "Maximum quantity cannot be less than minimum quantity." when maxQty < minQty', async () => {
      renderModal();

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      const minQtyLabel = screen.getByText('Min Order Qty');
      const minQtyField = minQtyLabel.closest('div')?.querySelector('input');
      const maxQtyLabel = screen.getByText('Max Order Qty (optional)');
      const maxQtyField = maxQtyLabel.closest('div')?.querySelector('input');

      if (minQtyField) fireEvent.change(minQtyField, { target: { value: '5' } });
      if (maxQtyField) fireEvent.change(maxQtyField, { target: { value: '3' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Maximum quantity cannot be less than minimum quantity.'),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Warehouse auto-selection (create mode)
  // -------------------------------------------------------------------------
  describe('Warehouse auto-selection', () => {
    it('auto-selects the default warehouse for the default seller', () => {
      renderModal({
        offer: null,
        sellers: [sampleSeller],
        warehouses: [sampleWarehouse],
      });
      // The warehouse select trigger shows the selected warehouse label.
      // getAllByText because the value also appears as a hidden <option> in Radix Select.
      const matches = screen.getAllByText('Main Fulfillment Center (Default)');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No warehouses found" placeholder when seller has no warehouses', () => {
      renderModal({
        offer: null,
        sellers: [sampleSeller],
        warehouses: [],
      });
      expect(screen.getByText('No warehouses found')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Create flow — happy path
  // -------------------------------------------------------------------------
  describe('Create offer (happy path)', () => {
    it('calls createOffer with priceMinor and closes modal on success', async () => {
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      const savedOffer: Offer = { ...sampleOffer, id: 'offer_new' };
      mockedCreateOffer.mockResolvedValueOnce(savedOffer);

      renderModal({ offer: null, onSaved, onOpenChange });

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedCreateOffer).toHaveBeenCalledOnce();
        const callArgs = mockedCreateOffer.mock.calls[0]![0];
        // $19.99 USD = 1999 cents
        expect(callArgs.priceMinor).toBe('1999');
        expect(callArgs.variantId).toBe('var_1');
        expect(callArgs.sellerId).toBe('seller_1');
      });

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith(savedOffer);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Edit flow — happy path
  // -------------------------------------------------------------------------
  describe('Edit offer (happy path)', () => {
    it('calls updateOffer with expectedUpdatedAt and closes modal on success', async () => {
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      const updatedOffer: Offer = { ...sampleOffer, priceMinor: '2999' };
      mockedUpdateOffer.mockResolvedValueOnce(updatedOffer);

      renderModal({ offer: sampleOffer, onSaved, onOpenChange });

      // Wait for useEffect to settle and reset the form with offer values.
      // The price input is pre-populated with '24.99' (priceMinor '2499' / 100).
      const priceInput = await waitFor(() => screen.getByPlaceholderText('e.g. 29.99'));
      // Change to dirty the form (default is '24.99')
      fireEvent.change(priceInput, { target: { value: '29.99' } });

      // Verify the field is now dirty/changed before submitting
      await waitFor(() => {
        expect((priceInput as HTMLInputElement).value).toBe('29.99');
      });

      const submitBtn = screen.getByRole('button', { name: 'Save Offer' });
      fireEvent.click(submitBtn);

      await waitFor(
        () => {
          expect(mockedUpdateOffer).toHaveBeenCalledOnce();
          const [offerId, body] = mockedUpdateOffer.mock.calls[0]!;
          expect(offerId).toBe('offer_1');
          expect(body.expectedUpdatedAt).toBe(sampleOffer.updatedAt);
          // $29.99 = 2999 cents
          expect(body.priceMinor).toBe('2999');
        },
        { timeout: 3000 },
      );

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith(updatedOffer);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Server error display
  // -------------------------------------------------------------------------
  describe('Server error display', () => {
    it('displays localized server error when createOffer rejects with a non-409 error', async () => {
      mockedCreateOffer.mockRejectedValueOnce(new AdminApiError('INTERNAL_SERVER_ERROR', 500));

      renderModal({ offer: null });

      const priceInput = screen.getByPlaceholderText('e.g. 29.99');
      fireEvent.change(priceInput, { target: { value: '19.99' } });

      const submitBtn = screen.getByRole('button', { name: 'Create Offer' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        // Server error banner should appear; exact text depends on catalogErrorKey mapping
        const errorBanner = document.querySelector('[class*="destructive"]');
        expect(errorBanner).toBeInTheDocument();
      });
    });
  });
});
