import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  Buybox,
  Offer,
  Product,
  SellerWithShop,
  Variant,
  Warehouse,
} from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import {
  deleteOffer,
  getVariantBuybox,
  listProductOffers,
  listSellers,
  listVariants,
  listWarehouses,
  updateOffer,
  updateStock,
} from './api';
import { ProductOffersDialog } from './product-offers-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listVariants: vi.fn(),
    listProductOffers: vi.fn(),
    listSellers: vi.fn(),
    listWarehouses: vi.fn(),
    getVariantBuybox: vi.fn(),
    deleteOffer: vi.fn(),
    restoreOffer: vi.fn(),
    updateOffer: vi.fn(),
    updateStock: vi.fn(),
  };
});

const mockedListVariants = vi.mocked(listVariants);
const mockedListProductOffers = vi.mocked(listProductOffers);
const mockedListSellers = vi.mocked(listSellers);
const mockedListWarehouses = vi.mocked(listWarehouses);
const mockedGetVariantBuybox = vi.mocked(getVariantBuybox);
const mockedDeleteOffer = vi.mocked(deleteOffer);
const mockedUpdateOffer = vi.mocked(updateOffer);
const mockedUpdateStock = vi.mocked(updateStock);

const sampleProduct: Product = {
  id: 'prod_1',
  categoryId: 'cat_1',
  brandId: null,
  title: { en: 'Organic Tee' },
  description: { en: 'Comfortable tee' },
  slug: 'organic-tee',
  status: 'active',
  basePriceMinor: '2999',
  currency: 'USD',
  spec: {},
  proposedBySellerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleVariant1: Variant = {
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

const sampleVariant2: Variant = {
  id: 'var_2',
  productId: 'prod_1',
  skuCode: 'TEE-M',
  gtin: '123456789013',
  weightG: 200,
  dims: { length: 250, width: 200, height: 15 },
  comboSignature: 'ot_size:val_m',
  status: 'active',
  position: 1,
  selections: [{ optionTypeId: 'ot_size', optionValueId: 'val_m' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

const sampleBuybox: Buybox = {
  variantId: 'var_1',
  winningOfferId: 'offer_1',
  winningSellerId: 'seller_1',
  winningSellerName: 'Acme Apparel',
  winningPriceMinor: '1999',
  winningCurrency: 'USD',
  sellerCount: 1,
  minPriceMinor: '1999',
  maxPriceMinor: '1999',
  computedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductOffersDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListVariants.mockResolvedValue([sampleVariant1, sampleVariant2]);
    mockedListProductOffers.mockResolvedValue([sampleOffer]);
    mockedListSellers.mockResolvedValue([sampleSeller]);
    mockedListWarehouses.mockResolvedValue([sampleWarehouse]);
    mockedGetVariantBuybox.mockResolvedValue(sampleBuybox);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders dialog with variant tabs, Buybox Winner card, and offers table', async () => {
    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('Offers & Stock')).toBeInTheDocument();
      expect(screen.getByText('TEE-S')).toBeInTheDocument();
      expect(screen.getByText('TEE-M')).toBeInTheDocument();
      expect(screen.getByText('Current Buy-Box Winner')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Acme Apparel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('USD $19.99').length).toBeGreaterThanOrEqual(1);
  });

  it('displays empty buybox state when variant has no winner', async () => {
    mockedGetVariantBuybox.mockResolvedValue({
      variantId: 'var_2',
      winningOfferId: null,
      winningSellerId: null,
      winningSellerName: null,
      winningPriceMinor: null,
      winningCurrency: null,
      sellerCount: 0,
      minPriceMinor: null,
      maxPriceMinor: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    });

    renderAdmin(
      <ProductOffersDialog
        open={true}
        onOpenChange={vi.fn()}
        product={sampleProduct}
        initialVariantId="var_2"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No Buy-Box Winner')).toBeInTheDocument();
      expect(
        screen.getByText('No active in-stock offers are currently competing for this variant.'),
      ).toBeInTheDocument();
    });
  });

  it('switches variant tab when clicked and refetches buybox', async () => {
    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('TEE-S')).toBeInTheDocument();
    });

    const tab2 = screen.getByText('TEE-M');
    fireEvent.click(tab2);

    await waitFor(() => {
      expect(mockedGetVariantBuybox).toHaveBeenCalledWith('var_2');
    });
  });

  it('triggers delete offer with soft-delete undo capability', async () => {
    mockedDeleteOffer.mockResolvedValue(undefined);

    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('USD $19.99')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText('Delete Offer');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockedDeleteOffer).toHaveBeenCalledWith('offer_1');
    });
  });

  it('opens Offer Form Modal when Add Offer button is clicked', async () => {
    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('Add Offer')).toBeInTheDocument();
    });

    const createBtn = screen.getByText('Add Offer');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Create Seller Offer')).toBeInTheDocument();
      expect(screen.getByText('List Price (USD)')).toBeInTheDocument();
    });
  });

  it('opens Stock Adjust Modal when Adjust Stock button is clicked', async () => {
    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Adjust Stock')).toBeInTheDocument();
    });

    const stockBtn = screen.getByLabelText('Adjust Stock');
    fireEvent.click(stockBtn);

    await waitFor(() => {
      expect(screen.getByText('Adjust Stock Levels — Acme Apparel')).toBeInTheDocument();
      expect(screen.getByText('Main Fulfillment Center')).toBeInTheDocument();
    });
  });

  it('renders read-only notice when product is archived', async () => {
    const archivedProduct: Product = {
      ...sampleProduct,
      status: 'archived',
    };

    renderAdmin(
      <ProductOffersDialog open={true} onOpenChange={vi.fn()} product={archivedProduct} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'This product is archived. Offers and inventory are displayed in read-only mode.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('Add Offer')).not.toBeInTheDocument();
    });
  });

  it('displays regular price without sale badge when promotional sale window is expired', async () => {
    const expiredSaleOffer: Offer = {
      ...sampleOffer,
      priceMinor: '2499',
      salePriceMinor: '1999',
      saleStartsAt: '2020-01-01T00:00:00.000Z',
      saleEndsAt: '2020-02-01T00:00:00.000Z',
      isBuyboxWinner: false,
    };
    mockedListProductOffers.mockResolvedValue([expiredSaleOffer]);
    mockedGetVariantBuybox.mockResolvedValue({
      ...sampleBuybox,
      winningPriceMinor: '2499',
      minPriceMinor: '2499',
      maxPriceMinor: '2499',
    });

    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('USD $24.99')).toBeInTheDocument();
    });
    // Sale price ($19.99) and Sale badge should not be present
    expect(screen.queryByText('USD $19.99')).not.toBeInTheDocument();
    expect(screen.queryByText('Sale')).not.toBeInTheDocument();
  });

  it('displays regular price without sale badge when promotional sale window is in the future', async () => {
    const futureSaleOffer: Offer = {
      ...sampleOffer,
      priceMinor: '2499',
      salePriceMinor: '1999',
      saleStartsAt: '2099-01-01T00:00:00.000Z',
      saleEndsAt: '2099-02-01T00:00:00.000Z',
      isBuyboxWinner: false,
    };
    mockedListProductOffers.mockResolvedValue([futureSaleOffer]);
    mockedGetVariantBuybox.mockResolvedValue({
      ...sampleBuybox,
      winningPriceMinor: '2499',
      minPriceMinor: '2499',
      maxPriceMinor: '2499',
    });

    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByText('USD $24.99')).toBeInTheDocument();
    });
    expect(screen.queryByText('USD $19.99')).not.toBeInTheDocument();
    expect(screen.queryByText('Sale')).not.toBeInTheDocument();
  });

  it('submits expectedUpdatedAt optimistic concurrency token when saving offer edits', async () => {
    const updatedOffer: Offer = {
      ...sampleOffer,
      priceMinor: '2999',
    };
    mockedUpdateOffer.mockResolvedValue(updatedOffer);

    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit Offer')).toBeInTheDocument();
    });

    const editBtn = screen.getByLabelText('Edit Offer');
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('Edit Offer Listing')).toBeInTheDocument();
    });

    // Change list price
    const priceInput = screen.getByDisplayValue('24.99');
    fireEvent.change(priceInput, { target: { value: '29.99' } });

    // Submit
    const saveBtn = screen.getByRole('button', { name: 'Save Offer' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockedUpdateOffer).toHaveBeenCalledWith(
        'offer_1',
        expect.objectContaining({
          expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
          priceMinor: '2999',
        }),
      );
    });
  });

  it('submits expectedUpdatedAt optimistic concurrency token when saving warehouse stock adjustments', async () => {
    mockedUpdateStock.mockResolvedValue({
      id: 'stock_1',
      warehouseId: 'wh_1',
      warehouseName: 'Main Fulfillment Center',
      onHand: 60,
      reserved: 5,
      available: 55,
      safetyStock: 5,
      backorder: false,
      restockEta: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    renderAdmin(<ProductOffersDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Adjust Stock')).toBeInTheDocument();
    });

    const stockBtn = screen.getByLabelText('Adjust Stock');
    fireEvent.click(stockBtn);

    await waitFor(() => {
      expect(screen.getByText('Adjust Stock Levels — Acme Apparel')).toBeInTheDocument();
      expect(screen.getByText('Main Fulfillment Center')).toBeInTheDocument();
    });

    // Save stock update
    const updateStockBtn = screen.getByRole('button', { name: 'Update Stock' });
    fireEvent.click(updateStockBtn);

    await waitFor(() => {
      expect(mockedUpdateStock).toHaveBeenCalledWith(
        'offer_1',
        'wh_1',
        expect.objectContaining({
          expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
          onHand: 50,
        }),
      );
    });
  });
});
