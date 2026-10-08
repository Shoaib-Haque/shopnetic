import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand, Category, Product } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listCategories } from '@/features/catalog/categories/api';
import { listBrandsPage } from '@/features/catalog/brands/api';
import { deleteProduct, getProduct, listProductsPage, restoreProduct } from './api';
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
    expect(screen.getAllByText('In-House (1P)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vendor Proposed (3P)').length).toBeGreaterThan(0);
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

    const pendingTab = screen.getByRole('button', { name: 'Pending Review' });
    fireEvent.click(pendingTab);

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

    const originSelect = screen.getByDisplayValue('All origins');
    fireEvent.change(originSelect, { target: { value: '3p' } });

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
});
