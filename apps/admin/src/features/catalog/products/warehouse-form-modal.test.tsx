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
    expect(screen.getByText('Country')).toBeInTheDocument();
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

  it('selects seller from dropdown and submits warehouse with selected sellerId', async () => {
    mockedCreateWarehouse.mockResolvedValue(sampleWarehouse);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={onOpenChange}
        sellers={[sampleSeller]}
        onCreated={onCreated}
      />,
    );

    // Pick seller from combobox
    fireEvent.click(screen.getByRole('combobox', { name: 'Seller' }));
    fireEvent.click(screen.getByRole('option', { name: 'Apex Logistics (3P)' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. Austin Regional Depot'), {
      target: { value: 'Austin Regional Depot' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 100 Industrial Blvd'), {
      target: { value: '100 Industrial Blvd' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Suite 400'), {
      target: { value: 'Suite 400' },
    });

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });
    fireEvent.change(screen.getByLabelText('State / Province (optional)'), {
      target: { value: 'TX' },
    });
    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), { target: { value: '78701' } });

    const submitBtn = screen.getByRole('button', { name: 'Create Warehouse' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateWarehouse).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerId: sampleSeller.id,
          name: 'Austin Regional Depot',
          isDefault: false,
          address: {
            line1: '100 Industrial Blvd',
            line2: 'Suite 400',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
        }),
      );
      expect(onCreated).toHaveBeenCalledWith(sampleWarehouse);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
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

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });
    fireEvent.change(screen.getByLabelText('State / Province (optional)'), {
      target: { value: 'TX' },
    });
    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), { target: { value: '78701' } });

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

  it('searches and selects country from CountryCombobox', async () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={vi.fn()}
      />,
    );

    // Default country is United States (US)
    const countryTrigger = screen.getByRole('combobox', { name: /United States \(US\)/i });
    expect(countryTrigger).toBeInTheDocument();

    // Open CountryCombobox
    fireEvent.click(countryTrigger);

    // Search input should appear
    const searchInput = screen.getByPlaceholderText('Search countries…');
    expect(searchInput).toBeInTheDocument();

    // Search for Canada
    fireEvent.change(searchInput, { target: { value: 'Canada' } });
    const canadaOption = screen.getByRole('option', { name: /Canada \(CA\)/i });
    expect(canadaOption).toBeInTheDocument();

    // Select Canada
    fireEvent.click(canadaOption);

    // Combobox trigger should now display Canada (CA)
    expect(screen.getByRole('combobox', { name: /Canada \(CA\)/i })).toBeInTheDocument();
  });

  it('validates postal code format per selected country', async () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. Austin Regional Depot'), {
      target: { value: 'Austin Regional Depot' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 100 Industrial Blvd'), {
      target: { value: '100 Industrial Blvd' },
    });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });

    // 1. Invalid US postal code
    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), { target: { value: 'ABCDE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    await waitFor(() => {
      expect(
        screen.getByText('Enter a valid postal / ZIP code for the selected country.'),
      ).toBeInTheDocument();
    });

    // 2. Select Canada (CA) and enter a US zip (invalid for Canada)
    const countryTrigger = screen.getByRole('combobox', { name: /United States \(US\)/i });
    fireEvent.click(countryTrigger);
    fireEvent.click(screen.getByRole('option', { name: /Canada \(CA\)/i }));

    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), { target: { value: '78701' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    await waitFor(() => {
      expect(
        screen.getByText('Enter a valid postal / ZIP code for the selected country.'),
      ).toBeInTheDocument();
    });

    // 3. Enter valid Canadian postal code
    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), { target: { value: 'K1A 0B1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    await waitFor(() => {
      expect(
        screen.queryByText('Enter a valid postal / ZIP code for the selected country.'),
      ).not.toBeInTheDocument();
    });
  });

  it('enforces maximum length boundaries on warehouse name and address fields', async () => {
    renderAdmin(
      <WarehouseFormModal
        open={true}
        onOpenChange={vi.fn()}
        sellerId={testSellerId}
        sellerName="Acme Retail"
        onCreated={vi.fn()}
      />,
    );

    // Enter strings that exceed length limits
    fireEvent.change(screen.getByPlaceholderText('e.g. Austin Regional Depot'), {
      target: { value: 'A'.repeat(101) },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 100 Industrial Blvd'), {
      target: { value: 'B'.repeat(201) },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Suite 400'), {
      target: { value: 'C'.repeat(201) },
    });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'D'.repeat(101) } });
    fireEvent.change(screen.getByLabelText('State / Province (optional)'), {
      target: { value: 'E'.repeat(101) },
    });
    fireEvent.change(screen.getByLabelText('Postal / ZIP Code'), {
      target: { value: 'F'.repeat(25) },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    await waitFor(() => {
      expect(
        screen.getByText('Warehouse name must be 100 characters or fewer.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Street address line 1 cannot exceed 200 characters.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Street address line 2 cannot exceed 200 characters.'),
      ).toBeInTheDocument();
      expect(screen.getByText('City cannot exceed 100 characters.')).toBeInTheDocument();
      expect(
        screen.getByText('State / Province cannot exceed 100 characters.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Postal / ZIP code cannot exceed 20 characters.'),
      ).toBeInTheDocument();
    });

    expect(mockedCreateWarehouse).not.toHaveBeenCalled();
  });
});
