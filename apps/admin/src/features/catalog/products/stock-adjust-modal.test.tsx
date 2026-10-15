import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Offer, StockLevel, Warehouse } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { updateStock } from './api';
import { StockAdjustModal } from './stock-adjust-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    updateStock: vi.fn(),
  };
});

const mockedUpdateStock = vi.mocked(updateStock);

const sampleWarehouse1: Warehouse = {
  id: 'wh_1',
  sellerId: 'seller_1',
  name: 'Main Seattle Depot',
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

const sampleWarehouse2: Warehouse = {
  id: 'wh_2',
  sellerId: 'seller_1',
  name: 'East Coast Center',
  isDefault: false,
  address: {
    line1: '456 Atlantic Ave',
    city: 'Boston',
    state: 'MA',
    postalCode: '02110',
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
  skuCode: 'TEE-S-BLK',
  priceMinor: '2499',
  currency: 'USD',
  salePriceMinor: null,
  saleStartsAt: null,
  saleEndsAt: null,
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
      warehouseName: 'Main Seattle Depot',
      onHand: 50,
      reserved: 5,
      available: 45,
      safetyStock: 10,
      backorder: false,
      restockEta: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

describe('StockAdjustModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal with offer title, subtitle, and metadata in header', () => {
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Adjust Stock Levels — Acme Apparel')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage on-hand inventory, safety thresholds, and backorder rules per warehouse.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('TEE-S-BLK')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText(/Total Available:/)).toHaveTextContent('45');
    expect(screen.getByText(/50 on hand/)).toBeInTheDocument();
  });

  it('has responsive layout in header and renders "+ Add warehouse" button stacked on mobile', () => {
    const handleNewWarehouse = vi.fn();
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={vi.fn()}
        onNewWarehouseRequested={handleNewWarehouse}
      />,
    );

    // Verify "+ Add warehouse" button has full width on mobile and auto width on sm: w-full sm:w-auto
    const addBtn = screen.getByRole('button', { name: /Add warehouse/i });
    expect(addBtn.className).toContain('w-full');
    expect(addBtn.className).toContain('sm:w-auto');

    // Verify header flex layout contains responsive classes: flex-col sm:flex-row sm:items-start
    const headerRow = addBtn.parentElement;
    expect(headerRow?.className).toContain('flex-col');
    expect(headerRow?.className).toContain('sm:flex-row');
    expect(headerRow?.className).toContain('sm:items-start');

    fireEvent.click(addBtn);
    expect(handleNewWarehouse).toHaveBeenCalledTimes(1);
  });

  it('renders empty warehouse state with an action button when warehouses array is empty', () => {
    const handleNewWarehouse = vi.fn();
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[]}
        onStockUpdated={vi.fn()}
        onNewWarehouseRequested={handleNewWarehouse}
      />,
    );

    expect(screen.getByText('No warehouses configured for this seller yet.')).toBeInTheDocument();

    const addBtns = screen.getAllByRole('button', { name: /Add warehouse/i });
    expect(addBtns.length).toBeGreaterThanOrEqual(2); // Header button + empty state button

    fireEvent.click(addBtns[1]!);
    expect(handleNewWarehouse).toHaveBeenCalled();
  });

  it('renders warehouse allocations, badges, addresses, and stock metrics', () => {
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1, sampleWarehouse2]}
        onStockUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Main Seattle Depot')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText(/123 Warehouse Way, Seattle, US/)).toBeInTheDocument();

    expect(screen.getByText('East Coast Center')).toBeInTheDocument();

    // Reserved units
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('recalculates live available stock when on-hand inventory is modified', () => {
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={vi.fn()}
      />,
    );

    const onHandInputs = screen.getAllByRole('spinbutton');
    const onHandInput = onHandInputs[0]!;
    expect(onHandInput).toHaveValue(50);

    // Reserved is 5, so initial available in card is 45
    const availableElements = screen.getAllByText('45');
    expect(availableElements.length).toBeGreaterThanOrEqual(1);

    // Change onHand to 80 -> available should recalculate to 75 (80 - 5)
    fireEvent.change(onHandInput, { target: { value: '80' } });
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('calls updateStock with optimistic concurrency token expectedUpdatedAt and triggers onStockUpdated', async () => {
    const handleStockUpdated = vi.fn();
    const updatedLevel: StockLevel = {
      id: 'stock_1',
      warehouseId: 'wh_1',
      warehouseName: 'Main Seattle Depot',
      onHand: 70,
      reserved: 5,
      available: 65,
      safetyStock: 15,
      backorder: true,
      restockEta: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    mockedUpdateStock.mockResolvedValueOnce(updatedLevel);

    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={handleStockUpdated}
      />,
    );

    const inputs = screen.getAllByRole('spinbutton');
    const onHandInput = inputs[0]!;
    const safetyStockInput = inputs[1]!;

    fireEvent.change(onHandInput, { target: { value: '70' } });
    fireEvent.change(safetyStockInput, { target: { value: '15' } });

    const switchBtn = screen.getByRole('switch', { name: /Allow Backorders/i });
    fireEvent.click(switchBtn);

    const saveBtn = screen.getByRole('button', { name: /Update Stock/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockedUpdateStock).toHaveBeenCalledTimes(1);
    });

    expect(mockedUpdateStock).toHaveBeenCalledWith(
      'offer_1',
      'wh_1',
      expect.objectContaining({
        onHand: 70,
        safetyStock: 15,
        backorder: true,
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    await waitFor(() => {
      expect(handleStockUpdated).toHaveBeenCalledWith('offer_1', updatedLevel);
    });

    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('displays localized error message when updateStock fails with conflict', async () => {
    mockedUpdateStock.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={vi.fn()}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={vi.fn()}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: /Update Stock/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockedUpdateStock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getByText('That action conflicts with the current state — reload and try again.'),
      ).toBeInTheDocument();
    });
  });

  it('calls onOpenChange(false) when cancel button is clicked', () => {
    const handleOpenChange = vi.fn();
    renderAdmin(
      <StockAdjustModal
        open={true}
        onOpenChange={handleOpenChange}
        offer={sampleOffer}
        warehouses={[sampleWarehouse1]}
        onStockUpdated={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
