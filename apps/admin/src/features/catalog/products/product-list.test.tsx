import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand, Category, Product } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listCategories } from '@/features/catalog/categories/api';
import { listBrandsPage } from '@/features/catalog/brands/api';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProductsPage,
  restoreProduct,
  updateProduct,
} from './api';
import { ProductList } from './product-list';

vi.mock('@/features/catalog/categories/api', () => ({
  listCategories: vi.fn(),
}));

vi.mock('@/features/catalog/brands/api', () => ({
  listBrandsPage: vi.fn(),
}));

vi.mock('./api', () => ({
  listProductsPage: vi.fn(),
  getProduct: vi.fn(),
  deleteProduct: vi.fn(),
  restoreProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  listProductOptions: vi.fn().mockResolvedValue([]),
  listVariants: vi.fn().mockResolvedValue([]),
  listProductMedia: vi.fn().mockResolvedValue([]),
  listProductOffers: vi.fn().mockResolvedValue([]),
  listSellers: vi.fn().mockResolvedValue([]),
  listWarehouses: vi.fn().mockResolvedValue([]),
  getVariantBuybox: vi.fn().mockResolvedValue(null),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/en/x7f2k9t3m1qp/catalog/products',
  useSearchParams: () => mockSearchParams,
}));

const mockedListCategories = vi.mocked(listCategories);
const mockedListBrandsPage = vi.mocked(listBrandsPage);
const mockedListProductsPage = vi.mocked(listProductsPage);
const mockedGetProduct = vi.mocked(getProduct);
const mockedDeleteProduct = vi.mocked(deleteProduct);
const mockedRestoreProduct = vi.mocked(restoreProduct);
const mockedCreateProduct = vi.mocked(createProduct);
const mockedUpdateProduct = vi.mocked(updateProduct);

const mockCategories: Category[] = [
  {
    id: 'cat-1',
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
];

const mockBrands: Brand[] = [
  {
    id: 'brand-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    displayName: null,
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

function sampleProduct(id: string, titleEn: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    categoryId: 'cat-1',
    brandId: 'brand-1',
    title: { en: titleEn },
    description: null,
    slug: id,
    status: 'active',
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

function openFirstRowMenu(): void {
  const trigger = screen.getAllByRole('button', { name: 'More actions' })[0]!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

function openFiltersPopover(): void {
  const trigger = screen.getByRole('button', { name: /Filters/i });
  fireEvent.click(trigger);
}

// Radix `Select` renders a `role="combobox"` trigger + a portalled listbox of
// `role="option"` items, not a native `<select>` — `fireEvent.change` and
// `getByDisplayValue` (both native-select-only APIs) no longer apply; open it
// and click the option by its accessible name instead.
function selectOption(comboboxName: string | RegExp, optionName: string | RegExp): void {
  fireEvent.click(screen.getByRole('combobox', { name: comboboxName }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockedListCategories.mockResolvedValue(mockCategories);
  mockedListBrandsPage.mockResolvedValue({ brands: mockBrands, nextCursor: undefined });
  mockedListProductsPage.mockResolvedValue({ products: [], nextCursor: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProductList', () => {
  it('renders products with origin badge (1P in-house and 3P vendor proposal)', async () => {
    mockedListProductsPage.mockResolvedValueOnce({
      products: [
        sampleProduct('p-1', 'Platform Hoodie', { proposedBySellerId: null, status: 'active' }),
        sampleProduct('p-2', 'Vendor Sneakers', {
          proposedBySellerId: 'seller-123',
          status: 'pending',
        }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);
    expect(screen.getAllByText('Vendor Sneakers')).not.toHaveLength(0);

    // Badges
    expect(screen.getAllByText('1P').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3P').length).toBeGreaterThan(0);

    // Mobile card labeled rows
    expect(screen.getAllByText(/^Brand:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Base Price:/).length).toBeGreaterThan(0);
  });

  it('shows empty message when no products match', async () => {
    mockedListProductsPage.mockResolvedValueOnce({ products: [], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
  });

  it('switching to Pending Review tab requests pending status', async () => {
    mockedListProductsPage.mockResolvedValue({ products: [], nextCursor: undefined });

    renderAdmin(<ProductList />);

    await screen.findByText('No products yet.');

    openFiltersPopover();

    selectOption('Status', 'Pending Review');

    await waitFor(() => {
      expect(mockedListProductsPage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });
  });

  it('filtering by origin requests specific origin', async () => {
    mockedListProductsPage.mockResolvedValue({ products: [], nextCursor: undefined });

    renderAdmin(<ProductList />);

    await screen.findByText('No products yet.');

    openFiltersPopover();

    selectOption('Origin', '3P');

    await waitFor(() => {
      expect(mockedListProductsPage).toHaveBeenCalledWith(
        expect.objectContaining({ origin: '3p' }),
      );
    });
  });

  it('deleting a product calls deleteProduct and displays undo toast', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });
    mockedDeleteProduct.mockResolvedValueOnce();

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const deleteBtn = await screen.findByRole('menuitem', { name: 'Archive' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockedDeleteProduct).toHaveBeenCalledWith('p-1');
    });

    expect(await screen.findByText('Archived “Platform Hoodie”.')).toBeInTheDocument();
  });

  it('restoring an archived product opens confirm dialog and posts restore', async () => {
    const archivedItem = sampleProduct('p-archived', 'Old Product', {
      status: 'archived',
      archivedAt: '2026-01-01T00:00:00.000Z',
    });
    mockSearchParams = new URLSearchParams('tab=archived');

    mockedListProductsPage.mockResolvedValue({ products: [archivedItem], nextCursor: undefined });
    mockedRestoreProduct.mockResolvedValueOnce(archivedItem);

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Old Product')).not.toHaveLength(0);

    openFirstRowMenu();

    const restoreMenuItem = await screen.findByRole('menuitem', { name: 'Restore' });
    fireEvent.click(restoreMenuItem);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Restore' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedRestoreProduct).toHaveBeenCalledWith('p-archived');
    });
  });

  it('opens review proposal modal for pending product', async () => {
    const pendingItem = sampleProduct('p-pending', 'Vendor Proposal', {
      status: 'pending',
      proposedBySellerId: 'seller-abc',
    });

    mockedListProductsPage.mockResolvedValue({ products: [pendingItem], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Vendor Proposal')).not.toHaveLength(0);

    openFirstRowMenu();

    const reviewMenuItem = await screen.findByRole('menuitem', { name: 'Review proposal' });
    fireEvent.click(reviewMenuItem);

    expect(await screen.findByText('Review vendor proposal')).toBeInTheDocument();
    expect(screen.getByText('Proposed by vendor (Seller ID: seller-abc)')).toBeInTheDocument();
  });

  it('pins deep-link target row with spotlight styling', async () => {
    const targetProduct = sampleProduct('p-target', 'Deep Linked Product');
    mockSearchParams = new URLSearchParams('target=p-target');
    mockedGetProduct.mockResolvedValue(targetProduct);
    mockedListProductsPage.mockResolvedValue({
      products: [sampleProduct('p-other', 'Other Product')],
      nextCursor: undefined,
    });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Deep Linked Product')).not.toHaveLength(0);
    const rows = document.querySelectorAll('[data-product-row="p-target"]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('opens configure options dialog from row menu', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const optionsBtn = await screen.findByRole('menuitem', { name: 'Configure Options' });
    fireEvent.click(optionsBtn);

    expect(await screen.findByText('Product Options & Attributes')).toBeInTheDocument();
  });

  it('opens manage variants dialog from row menu', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const variantsBtn = await screen.findByRole('menuitem', { name: 'Manage Variants' });
    fireEvent.click(variantsBtn);

    expect(await screen.findByText('Product Variants')).toBeInTheDocument();
  });

  it('opens manage media dialog from row menu', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const mediaBtn = await screen.findByRole('menuitem', { name: 'Manage Media' });
    fireEvent.click(mediaBtn);

    expect(await screen.findByText('Product Media Gallery')).toBeInTheDocument();
  });

  it('resets secondary filters and search query when switching status tabs', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    // Enter search query
    const searchInput = screen.getByPlaceholderText('Search products by title or slug… (/)');
    fireEvent.change(searchInput, { target: { value: 'hoodie' } });
    expect(searchInput).toHaveValue('hoodie');

    openFiltersPopover();

    // Change origin, category, and brand filters
    selectOption('Origin', '3P');
    expect(screen.getByRole('combobox', { name: 'Origin' })).toHaveTextContent('3P');

    selectOption('Category', 'Apparel');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Apparel');

    selectOption('Brand', 'Acme Corp');
    expect(screen.getByRole('combobox', { name: 'Brand' })).toHaveTextContent('Acme Corp');

    // Switch status to Archived
    selectOption('Status', 'Archived');

    // Verify secondary filters and search input reset
    expect(searchInput).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Origin' })).toHaveTextContent('All origins');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories');
    expect(screen.getByRole('combobox', { name: 'Brand' })).toHaveTextContent('All brands');

    await waitFor(() => {
      expect(mockedListProductsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'archived',
          origin: 'all',
        }),
      );
    });
  });

  it('clears all filters when clicking Clear filters inside popover', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFiltersPopover();

    selectOption('Origin', '3P');

    // When filters are active, there is a clear button outside and one inside the popover.
    // Query the clear button inside the popover:
    const clearBtn = screen.getAllByRole('button', { name: 'Clear filters' })[0]!;
    expect(clearBtn).not.toBeDisabled();
    fireEvent.click(clearBtn);

    expect(screen.getByRole('combobox', { name: 'Origin' })).toHaveTextContent('All origins');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });

  it('renders em-dash for unbranded product and fallback for archived category and brand', async () => {
    mockedListProductsPage.mockResolvedValueOnce({
      products: [
        sampleProduct('p-unbranded', 'Raw Shirt', {
          brandId: null,
          categoryId: 'cat-nonexistent',
          basePriceMinor: '1999',
          currency: 'USD',
        }),
        sampleProduct('p-archived-brand', 'Vintage Jacket', {
          brandId: 'brand-archived-123',
          categoryId: 'cat-1',
          basePriceMinor: '4999',
          currency: 'USD',
        }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Raw Shirt')).not.toHaveLength(0);
    expect(screen.getAllByText('Vintage Jacket')).not.toHaveLength(0);
    // Unbranded shows em-dash '—'
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // Nonexistent / archived category shows 'Archived category'
    expect(screen.getAllByText('Archived category').length).toBeGreaterThan(0);
    // Nonexistent / archived brand shows 'Archived brand' (never '—')
    expect(screen.getAllByText('Archived brand').length).toBeGreaterThan(0);
    // Single line base price formatted
    expect(screen.getAllByText(/19\.99/).length).toBeGreaterThan(0);
  });

  it('removes approved vendor proposal from pending list view after successful review', async () => {
    const validCatId = '22222222-2222-2222-2222-222222222222';
    mockedListCategories.mockResolvedValue([{ ...mockCategories[0]!, id: validCatId }]);
    const pendingItem = sampleProduct('p-pending', 'Vendor Proposal', {
      categoryId: validCatId,
      brandId: null,
      status: 'pending',
      proposedBySellerId: 'seller-abc',
    });
    mockSearchParams = new URLSearchParams('tab=pending');
    mockedListProductsPage.mockResolvedValue({ products: [pendingItem], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Vendor Proposal')).not.toHaveLength(0);

    openFirstRowMenu();

    const reviewMenuItem = await screen.findByRole('menuitem', { name: 'Review proposal' });
    fireEvent.click(reviewMenuItem);

    const approveBtn = await screen.findByRole('button', { name: 'Approve & Publish' });
    const approvedProduct = { ...pendingItem, status: 'active' as const };
    mockedUpdateProduct.mockResolvedValueOnce(approvedProduct);

    fireEvent.click(approveBtn);

    // Product was approved -> status is now 'active', so it no longer matches the 'pending' tab filter
    // and is immediately removed from the pending list
    await waitFor(() => {
      expect(mockedUpdateProduct).toHaveBeenCalledWith(
        'p-pending',
        expect.objectContaining({ status: 'active' }),
      );
      expect(screen.queryByText('Vendor Proposal')).not.toBeInTheDocument();
    });
  });

  it('opens view details modal for archived product from row menu', async () => {
    const validCatId = mockCategories[0]!.id;
    const archivedItem = sampleProduct('p-archived', 'Archived Hoodie', {
      categoryId: validCatId,
      status: 'archived',
      archivedAt: '2026-02-01T00:00:00.000Z',
    });
    mockSearchParams = new URLSearchParams('tab=archived');
    mockedListProductsPage.mockResolvedValue({ products: [archivedItem], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Archived Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const viewMenuItem = await screen.findByRole('menuitem', { name: 'View details' });
    fireEvent.click(viewMenuItem);

    expect(await screen.findByText('Product details (Archived)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('opens offers & stock dialog from row menu', async () => {
    const item = sampleProduct('p-1', 'Platform Hoodie');
    mockedListProductsPage.mockResolvedValue({ products: [item], nextCursor: undefined });

    renderAdmin(<ProductList />);

    expect(await screen.findAllByText('Platform Hoodie')).not.toHaveLength(0);

    openFirstRowMenu();

    const offersBtn = await screen.findByRole('menuitem', { name: 'Offers & Stock' });
    fireEvent.click(offersBtn);

    expect(await screen.findByText('Offers & Stock')).toBeInTheDocument();
  });

  it('creating a product switches to its status tab, resets secondary filters, and pins the product', async () => {
    const validCatId = '22222222-2222-2222-2222-222222222222';
    mockedListCategories.mockResolvedValue([{ ...mockCategories[0]!, id: validCatId }]);
    mockedListBrandsPage.mockResolvedValue({ brands: mockBrands, nextCursor: undefined });
    mockedListProductsPage.mockResolvedValue({ products: [], nextCursor: undefined });

    const newProduct = sampleProduct('p-created', 'Brand New Hoodie', {
      status: 'active',
      categoryId: validCatId,
    });
    mockedCreateProduct.mockResolvedValue(newProduct);

    // Start on 'draft' tab
    mockSearchParams = new URLSearchParams('tab=draft');

    renderAdmin(<ProductList />);

    // Click "New product"
    fireEvent.click(await screen.findByRole('button', { name: /New product/i }));
    expect(await screen.findByText('New product (1P)')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Brand New Hoodie' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockedCreateProduct).toHaveBeenCalled();
    });

    // Pinned product is displayed in the list (in both desktop and mobile view)
    expect(await screen.findAllByText('Brand New Hoodie')).not.toHaveLength(0);
    const rows = document.querySelectorAll('[data-product-row="p-created"]');
    expect(rows.length).toBeGreaterThan(0);
  });
});
