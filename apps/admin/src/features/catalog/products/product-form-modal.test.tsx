import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand, Category, Product } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { createProduct, updateProduct } from './api';
import { ProductFormModal } from './product-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
  };
});

const mockedCreateProduct = vi.mocked(createProduct);
const mockedUpdateProduct = vi.mocked(updateProduct);

const mockCategories: Category[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    parentId: null,
    slug: 'apparel',
    name: { en: 'Apparel' },
    path: 'apparel',
    depth: 0,
    position: 0,
    isActive: true,
    brandRequirement: 'none',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    parentId: '11111111-1111-1111-1111-111111111111',
    slug: 't-shirts',
    name: { en: 'T-Shirts' },
    path: 'apparel.t-shirts',
    depth: 1,
    position: 0,
    isActive: true,
    brandRequirement: 'none',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockBrands: Brand[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Acme Corp',
    slug: 'acme-corp',
    displayName: { en: 'Acme Corporation' },
    logoKey: null,
    status: 'active',
    isRestricted: false,
    mergedIntoBrandId: null,
    archived: false,
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    categoryId: '22222222-2222-2222-2222-222222222222',
    brandId: '33333333-3333-3333-3333-333333333333',
    title: { en: 'Classic Crewneck Tee' },
    description: { en: '100% organic cotton basic t-shirt' },
    slug: 'classic-crewneck-tee',
    status: 'draft',
    basePriceMinor: '2999',
    currency: 'USD',
    spec: {},
    proposedBySellerId: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductFormModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders create mode and auto-generates slug from title', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="create"
        categories={mockCategories}
        brands={mockBrands}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText('New product (1P)')).toBeInTheDocument();
    const titleInput = screen.getByLabelText(/Title/i);
    const slugInput = screen.getByLabelText(/Slug/i);

    fireEvent.change(titleInput, { target: { value: 'Super Soft Hoodie' } });
    expect(slugInput).toHaveValue('super-soft-hoodie');
  });

  it('submits create form and calls createProduct with 1P defaults', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const createdProduct = sampleProduct({
      title: { en: 'Super Soft Hoodie' },
      slug: 'super-soft-hoodie',
    });
    mockedCreateProduct.mockResolvedValueOnce(createdProduct);

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="create"
        categories={mockCategories}
        brands={mockBrands}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Super Soft Hoodie' } });
    fireEvent.change(screen.getByLabelText(/Base Price/i), { target: { value: '49.99' } });

    const submitBtn = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: '11111111-1111-1111-1111-111111111111',
          title: { en: 'Super Soft Hoodie' },
          slug: 'super-soft-hoodie',
          basePriceMinor: 4999,
          currency: 'USD',
          proposedBySellerId: null,
          status: 'draft',
        }),
      );
      expect(onSaved).toHaveBeenCalledWith('created', createdProduct);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders edit mode with locked category and sends expectedUpdatedAt', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const product = sampleProduct({ updatedAt: '2026-02-01T00:00:00.000Z' });
    const updatedProduct = { ...product, title: { en: 'Updated Tee' } };
    mockedUpdateProduct.mockResolvedValueOnce(updatedProduct);

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText('Edit product')).toBeInTheDocument();
    // Category locked hint displayed
    expect(screen.getByText('Category is permanently locked after creation.')).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Title/i);
    expect(titleInput).toHaveValue('Classic Crewneck Tee');
    fireEvent.change(titleInput, { target: { value: 'Updated Tee' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockedUpdateProduct).toHaveBeenCalledWith(
        product.id,
        expect.objectContaining({
          title: { en: 'Updated Tee' },
          expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
        }),
      );
      expect(onSaved).toHaveBeenCalledWith('updated', updatedProduct);
    });
  });

  it('triggers onConflict on 409 conflict during update', async () => {
    const onOpenChange = vi.fn();
    const onConflict = vi.fn();
    const product = sampleProduct();
    mockedUpdateProduct.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
        onConflict={onConflict}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1);
    });
  });

  it('renders review mode for 3P vendor proposals with Approve and Reject actions', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const sellerId = '55555555-5555-5555-5555-555555555555';
    const product = sampleProduct({
      proposedBySellerId: sellerId,
      status: 'pending',
    });
    const approvedProduct = { ...product, status: 'active' as const };
    mockedUpdateProduct.mockResolvedValueOnce(approvedProduct);

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="review"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText('Review vendor proposal')).toBeInTheDocument();
    expect(screen.getByText(`Proposed by vendor (Seller ID: ${sellerId})`)).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: 'Approve & Publish' });
    const rejectBtn = screen.getByRole('button', { name: 'Reject to Draft' });
    expect(approveBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockedUpdateProduct).toHaveBeenCalledWith(
        product.id,
        expect.objectContaining({
          status: 'active',
        }),
      );
      expect(onSaved).toHaveBeenCalledWith('updated', approvedProduct);
    });
  });

  it('handles reject in review mode to set status to draft', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const product = sampleProduct({
      proposedBySellerId: '55555555-5555-5555-5555-555555555555',
      status: 'pending',
    });
    const rejectedProduct = { ...product, status: 'draft' as const };
    mockedUpdateProduct.mockResolvedValueOnce(rejectedProduct);

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="review"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={onSaved}
      />,
    );

    const rejectBtn = screen.getByRole('button', { name: 'Reject to Draft' });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(mockedUpdateProduct).toHaveBeenCalledWith(
        product.id,
        expect.objectContaining({
          status: 'draft',
        }),
      );
      expect(onSaved).toHaveBeenCalledWith('updated', rejectedProduct);
    });
  });

  it('renders view mode for archived product as read-only', () => {
    const onOpenChange = vi.fn();
    const product = sampleProduct({
      status: 'archived',
      archivedAt: '2026-02-01T00:00:00.000Z',
    });

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="view"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText('Product details (Archived)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
