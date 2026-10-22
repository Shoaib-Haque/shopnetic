import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SellerWithShop, Warehouse } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { createWarehouse } from './api';
import { WarehouseFormModal } from './warehouse-form-modal';

vi.mock('./api', () => ({
  createWarehouse: vi.fn(),
}));

const mockedCreateWarehouse = vi.mocked(createWarehouse);

const testSellerId = '00000000-0000-4000-8000-000000000001';

const sampleSeller: SellerWithShop = {
  id: '00000000-0000-4000-8000-000000000002',
  accountId: '00000000-0000-4000-8000-000000000003',
  legalName: 'Apex Logistics LLC',
  type: 'business',
  country: 'US',
  status: 'approved',
  commissionOverrideBps: null,
  reserveBps: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  shop: {
    id: '00000000-0000-4000-8000-000000000004',
    sellerId: '00000000-0000-4000-8000-000000000002',
    slug: 'apex-logistics',
    displayName: 'Apex Logistics',
    description: null,
    logoUrl: null,
    bannerUrl: null,
    vacationUntil: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
};

const sampleWarehouse: Warehouse = {
  id: 'wh_test_1',
  sellerId: testSellerId,
  name: 'Austin Regional Depot',
  isDefault: true,
  address: {
    line1: '100 Industrial Blvd',
    line2: 'Suite 400',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

describe('WarehouseFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal with warehouse form fields for preselected seller', () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'New Warehouse' })).toBeInTheDocument();
    expect(
      screen.getByText('Register a fulfillment center or distribution depot for Acme Retail.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Seller')).not.toBeInTheDocument();
    expect(screen.getByText('Warehouse Name')).toBeInTheDocument();
    expect(screen.getByText('Set as default fulfillment warehouse')).toBeInTheDocument();
    expect(screen.getByText('Address Line 1')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Postal / ZIP Code')).toBeInTheDocument();
    expect(screen.getByText('Country Code (ISO 2-letter)')).toBeInTheDocument();
  });

  it('renders seller dropdown when sellerId is not provided and validates seller selection', async () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellers={[sampleSeller]}
        onCreated={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Register a fulfillment center or distribution depot.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Seller')).toBeInTheDocument();
    expect(screen.getByText('Select a seller...')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: 'Create Warehouse' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Seller selection is required.')).toBeInTheDocument();
      expect(screen.getByText('Warehouse name is required.')).toBeInTheDocument();
    });

    expect(mockedCreateWarehouse).not.toHaveBeenCalled();
  });

  it('validates required fields inline and blocks submission if invalid', async () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: 'Create Warehouse' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Warehouse name is required.')).toBeInTheDocument();
      expect(screen.getByText('Street address line 1 is required.')).toBeInTheDocument();
      expect(screen.getByText('City is required.')).toBeInTheDocument();
      expect(screen.getByText('Postal / ZIP code is required.')).toBeInTheDocument();
    });

    expect(mockedCreateWarehouse).not.toHaveBeenCalled();
  });

  it('submits valid warehouse data and invokes onCreated callback', async () => {
    mockedCreateWarehouse.mockResolvedValue(sampleWarehouse);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={onOpenChange}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. Austin Regional Depot'), {
      target: { value: 'Austin Regional Depot' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 100 Industrial Blvd'), {
      target: { value: '100 Industrial Blvd' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Suite 400'), {
      target: { value: 'Suite 400' },
    });

    // City, State, Postal code inputs
    const inputs = screen.getAllByRole('textbox');
    // inputs: name, line1, line2, city, state, postalCode, country
    const cityInput = inputs[3]!;
    const stateInput = inputs[4]!;
    const postalCodeInput = inputs[5]!;

    fireEvent.change(cityInput, { target: { value: 'Austin' } });
    fireEvent.change(stateInput, { target: { value: 'TX' } });
    fireEvent.change(postalCodeInput, { target: { value: '78701' } });

    // Click default warehouse checkbox
    const defaultCheckbox = screen.getByRole('checkbox');
    fireEvent.click(defaultCheckbox);

    const submitBtn = screen.getByRole('button', { name: 'Create Warehouse' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateWarehouse).toHaveBeenCalledWith({
        sellerId: testSellerId,
        name: 'Austin Regional Depot',
        isDefault: true,
        address: {
          line1: '100 Industrial Blvd',
          line2: 'Suite 400',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'US',
        },
      });
      expect(onCreated).toHaveBeenCalledWith(sampleWarehouse);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
