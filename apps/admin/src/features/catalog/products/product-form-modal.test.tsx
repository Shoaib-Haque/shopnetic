import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { plainTextToDoc, type Brand, type Category, type Product } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { createProduct, getSeller, updateProduct } from './api';
import { ProductFormModal } from './product-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    getSeller: vi.fn().mockResolvedValue({ id: 'dummy', shop: null }),
  };
});

const mockedCreateProduct = vi.mocked(createProduct);
const mockedUpdateProduct = vi.mocked(updateProduct);
const mockedGetSeller = vi.mocked(getSeller);

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
    description: { en: plainTextToDoc('100% organic cotton basic t-shirt') },
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

    const titleInput = screen.getByLabelText(/Title/i);
    fireEvent.change(titleInput, { target: { value: 'Conflicted Title' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1);
    });
  });

  it('closes modal without calling updateProduct when saving unchanged product in edit mode', async () => {
    const onOpenChange = vi.fn();
    const product = sampleProduct();

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockedUpdateProduct).not.toHaveBeenCalled();
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

  it('resolves and displays seller shop name on vendor proposal banner via getSeller', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const sellerId = '55555555-5555-5555-5555-555555555555';
    const product = sampleProduct({
      proposedBySellerId: sellerId,
      status: 'pending',
    });
    mockedGetSeller.mockResolvedValueOnce({
      id: sellerId,
      accountId: '00000000-0000-0000-0000-000000000001',
      legalName: 'Acme Corp',
      type: 'business',
      country: 'US',
      status: 'approved',
      commissionOverrideBps: null,
      reserveBps: null,
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      shop: {
        id: '66666666-6666-6666-6666-666666666666',
        sellerId,
        displayName: 'Acme Super Store',
        slug: 'acme-super-store',
        description: null,
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

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

    await waitFor(() => {
      expect(mockedGetSeller).toHaveBeenCalledWith(sellerId);
      expect(screen.getByText('Proposed by vendor: Acme Super Store')).toBeInTheDocument();
    });
  });

  it('falls back to sellerId in vendor proposal banner when getSeller fails', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const sellerId = '77777777-7777-7777-7777-777777777777';
    const product = sampleProduct({
      proposedBySellerId: sellerId,
      status: 'pending',
    });
    mockedGetSeller.mockRejectedValueOnce(new Error('Seller not found'));

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

    await waitFor(() => {
      expect(mockedGetSeller).toHaveBeenCalledWith(sellerId);
      expect(screen.getByText(`Proposed by vendor (Seller ID: ${sellerId})`)).toBeInTheDocument();
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

    const confirmRejectBtn = screen.getByRole('button', { name: 'Confirm Rejection' });
    fireEvent.click(confirmRejectBtn);

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

  it('captures optional rejection note when rejecting in review mode', async () => {
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

    const noteInput = screen.getByLabelText('Rejection Note (Optional)');
    fireEvent.change(noteInput, { target: { value: 'Please provide higher resolution photos.' } });

    const confirmRejectBtn = screen.getByRole('button', { name: 'Confirm Rejection' });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(mockedUpdateProduct).toHaveBeenCalledWith(
        product.id,
        expect.objectContaining({
          status: 'draft',
          spec: expect.objectContaining({
            rejectionNote: 'Please provide higher resolution photos.',
          }),
        }),
      );
      expect(onSaved).toHaveBeenCalledWith('updated', rejectedProduct);
    });
  });

  it('disables all input fields in review mode (B13 read-only)', () => {
    const onOpenChange = vi.fn();
    const product = sampleProduct({
      proposedBySellerId: '55555555-5555-5555-5555-555555555555',
      status: 'pending',
    });

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="review"
        product={product}
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Brand' })).toBeDisabled();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.getByLabelText('Slug')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(screen.getByLabelText('Base Price')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
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

  it('prompts to confirm discarding unsaved changes when closing a dirty form', async () => {
    const onOpenChange = vi.fn();

    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={onOpenChange}
        mode="create"
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
      />,
    );

    // Form starts clean; modify a field to make it dirty
    const titleInput = screen.getByLabelText(/Title/i);
    fireEvent.change(titleInput, { target: { value: 'Dirty Draft Title' } });

    // Click Cancel button in footer
    const cancelBtn = screen
      .getAllByRole('button', { name: 'Cancel' })
      .find((b) => b.textContent === 'Cancel')!;
    fireEvent.click(cancelBtn);

    // Discard confirmation dialog should appear; onOpenChange should NOT be called yet
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(
      screen.getByText('You have unsaved changes. If you close now, they will be lost.'),
    ).toBeInTheDocument();

    // Confirm discard
    const discardBtn = screen.getByRole('button', { name: 'Discard' });
    fireEvent.click(discardBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('auto-sanitizes decimal fractions when switching currency to zero-decimal JPY', async () => {
    renderAdmin(
      <ProductFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        categories={mockCategories}
        brands={mockBrands}
        onSaved={vi.fn()}
      />,
    );

    const priceInput = screen.getByLabelText(/Base price/i);
    fireEvent.change(priceInput, { target: { value: '150.75' } });
    expect(priceInput).toHaveValue('150.75');

    // Change currency to JPY via Radix Select
    const currencyCombobox = screen.getByRole('combobox', { name: /Currency/i });
    fireEvent.click(currencyCombobox);
    fireEvent.click(screen.getByRole('option', { name: /JPY/i }));

    // Base price should be automatically sanitized to '150' without decimals
    await waitFor(() => {
      expect(priceInput).toHaveValue('150');
    });
  });

  describe('Validation and Server Error Mapping', () => {
    it('blocks submission and displays inline error when Title is empty', async () => {
      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Please enter a product title.')).toBeInTheDocument();
      });
      expect(mockedCreateProduct).not.toHaveBeenCalled();
    });

    it('blocks submission and displays inline error when Slug is invalid or reserved', async () => {
      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Test Product' } });
      fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: 'admin' } });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Lowercase letters, digits, and single hyphens only.'),
        ).toBeInTheDocument();
      });
      expect(mockedCreateProduct).not.toHaveBeenCalled();
    });

    it('blocks submission and displays inline error when Base Price has invalid decimals', async () => {
      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Test Product' } });
      fireEvent.change(screen.getByLabelText(/Base price/i), { target: { value: '19.999' } });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Enter a valid non-negative number.')).toBeInTheDocument();
      });
      expect(mockedCreateProduct).not.toHaveBeenCalled();
    });

    it('maps backend PRODUCT_SLUG_TAKEN (409) to inline error on Slug field', async () => {
      mockedCreateProduct.mockRejectedValueOnce(new AdminApiError('PRODUCT_SLUG_TAKEN', 409));

      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), {
        target: { value: 'Duplicated Product' },
      });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      expect(await screen.findByText('That product slug is already in use.')).toBeInTheDocument();
    });

    it('maps backend PRODUCT_BRAND_REQUIRED (422) to inline error on Brand field', async () => {
      mockedCreateProduct.mockRejectedValueOnce(new AdminApiError('PRODUCT_BRAND_REQUIRED', 422));

      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), {
        target: { value: 'Brand Required Product' },
      });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      expect(
        await screen.findByText('This category requires a brand. Please select a brand.'),
      ).toBeInTheDocument();
    });

    it('maps backend PRODUCT_BRAND_NOT_ALLOWED (422) to inline error on Brand field', async () => {
      mockedCreateProduct.mockRejectedValueOnce(
        new AdminApiError('PRODUCT_BRAND_NOT_ALLOWED', 422),
      );

      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), {
        target: { value: 'Brand Forbidden Product' },
      });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      expect(
        await screen.findByText('This category does not allow a brand. Please select None.'),
      ).toBeInTheDocument();
    });

    it('displays top banner error when backend returns generic VALIDATION_ERROR (422)', async () => {
      mockedCreateProduct.mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR', 422));

      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Invalid Product' } });

      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      expect(await screen.findByText('Please check the highlighted fields.')).toBeInTheDocument();
    });
  });

  describe('Draft recovery lifecycle', () => {
    it('clears create-mode draft from sessionStorage when modal is closed or cancelled', () => {
      const draftDoc = plainTextToDoc('Unsaved Product A');
      sessionStorage.setItem('shopnetic:draft:product-desc:create', JSON.stringify(draftDoc));

      const onOpenChange = vi.fn();
      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={onOpenChange}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      const cancelBtn = screen
        .getAllByRole('button', { name: 'Cancel' })
        .find((b) => b.textContent === 'Cancel')!;
      fireEvent.click(cancelBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(sessionStorage.getItem('shopnetic:draft:product-desc:create')).toBeNull();
    });

    it('clears draft from sessionStorage upon successful product creation', async () => {
      const draftDoc = plainTextToDoc('Saved Product');
      sessionStorage.setItem('shopnetic:draft:product-desc:create', JSON.stringify(draftDoc));

      const newProduct = sampleProduct({ id: 'prod-new-123' });
      mockedCreateProduct.mockResolvedValueOnce(newProduct);

      const onSaved = vi.fn();
      renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={onSaved}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'New Test Product' } });
      const submitBtn = screen.getByRole('button', { name: 'Create' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedCreateProduct).toHaveBeenCalled();
        expect(onSaved).toHaveBeenCalledWith('created', newProduct);
      });

      expect(sessionStorage.getItem('shopnetic:draft:product-desc:create')).toBeNull();
    });

    it('clears create-mode draft from sessionStorage when modal unmounts (in-app route navigation)', async () => {
      const draftDoc = plainTextToDoc('Unsaved Product Navigated Away');
      sessionStorage.setItem('shopnetic:draft:product-desc:create', JSON.stringify(draftDoc));

      const { unmount } = renderAdmin(
        <ProductFormModal
          open
          onOpenChange={vi.fn()}
          mode="create"
          categories={mockCategories}
          brands={mockBrands}
          onSaved={vi.fn()}
        />,
      );

      // In-app route navigation tears down the modal component
      unmount();

      await waitFor(() => {
        expect(sessionStorage.getItem('shopnetic:draft:product-desc:create')).toBeNull();
      });
    });

    it('preserves create-mode draft on initial mount even under React.StrictMode', () => {
      const draftDoc = plainTextToDoc('Existing Abandoned Draft');
      sessionStorage.setItem('shopnetic:draft:product-desc:create', JSON.stringify(draftDoc));

      renderAdmin(
        <StrictMode>
          <ProductFormModal
            open
            onOpenChange={vi.fn()}
            mode="create"
            categories={mockCategories}
            brands={mockBrands}
            onSaved={vi.fn()}
          />
        </StrictMode>,
      );

      // Under StrictMode (mount -> cleanup -> mount), the draft must NOT be wiped
      expect(sessionStorage.getItem('shopnetic:draft:product-desc:create')).not.toBeNull();
    });
  });
});
