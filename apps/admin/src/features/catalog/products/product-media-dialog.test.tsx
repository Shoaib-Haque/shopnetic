import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MediaAsset, OptionType, Product, ProductOption } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import {
  createProductMedia,
  deleteMedia,
  deleteMediaTag,
  listProductMedia,
  listProductOptions,
  putMediaTag,
  reorderProductMedia,
} from './api';
import { ProductMediaDialog } from './product-media-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listProductMedia: vi.fn(),
    listProductOptions: vi.fn(),
    createProductMedia: vi.fn(),
    deleteMedia: vi.fn(),
    putMediaTag: vi.fn(),
    deleteMediaTag: vi.fn(),
    reorderProductMedia: vi.fn(),
  };
});

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

const mockedListProductMedia = vi.mocked(listProductMedia);
const mockedListProductOptions = vi.mocked(listProductOptions);
const mockedCreateProductMedia = vi.mocked(createProductMedia);
const mockedDeleteMedia = vi.mocked(deleteMedia);
const mockedPutMediaTag = vi.mocked(putMediaTag);
const mockedDeleteMediaTag = vi.mocked(deleteMediaTag);
const mockedReorderProductMedia = vi.mocked(reorderProductMedia);
const mockedListOptionTypesPage = vi.mocked(listOptionTypesPage);

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
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleOptionTypes: OptionType[] = [
  {
    id: 'ot_color',
    code: 'color',
    name: { en: 'Color' },
    dataType: 'select',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleProductOptions: ProductOption[] = [
  {
    optionTypeId: 'ot_color',
    optionTypeCode: 'color',
    values: [
      { optionValueId: 'val_navy', code: 'navy' },
      { optionValueId: 'val_black', code: 'black' },
    ],
  },
];

const sampleAssets: MediaAsset[] = [
  {
    id: 'media_1',
    ownerType: 'product',
    ownerId: 'prod_1',
    kind: 'image',
    fileKey: 'products/tee-front.jpg',
    posterKey: null,
    width: 800,
    height: 800,
    durationS: null,
    blurhash: null,
    alt: { en: 'Organic Tee Front View' },
    position: 0,
    status: 'active',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'media_2',
    ownerType: 'product',
    ownerId: 'prod_1',
    kind: 'image',
    fileKey: 'products/tee-navy.jpg',
    posterKey: null,
    width: 800,
    height: 800,
    durationS: null,
    blurhash: null,
    alt: { en: 'Navy Tee' },
    position: 1,
    status: 'active',
    tags: [
      {
        optionTypeId: 'ot_color',
        optionTypeCode: 'color',
        optionValueId: 'val_navy',
        code: 'navy',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ProductMediaDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListOptionTypesPage.mockResolvedValue({
      optionTypes: sampleOptionTypes,
      nextCursor: undefined,
    });
    mockedListProductOptions.mockResolvedValue(sampleProductOptions);
    mockedListProductMedia.mockResolvedValue(sampleAssets);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state and then media gallery items with cover and variant lead badges', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    expect(await screen.findByText('Product Media Gallery')).toBeInTheDocument();
    expect(screen.getByText('Product Cover')).toBeInTheDocument();
    expect(screen.getByText('Variant Lead')).toBeInTheDocument();
    expect(screen.getByText('“Organic Tee Front View”')).toBeInTheDocument();
    expect(screen.getByText('“Navy Tee”')).toBeInTheDocument();
  });

  it('filters between all, general, and variant-specific tabs', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    // General tab: only media_1 should show
    const generalTab = screen.getByRole('button', { name: /General/i });
    fireEvent.click(generalTab);
    expect(screen.getByText('“Organic Tee Front View”')).toBeInTheDocument();
    expect(screen.queryByText('“Navy Tee”')).not.toBeInTheDocument();

    // Variant-specific tab: only media_2 should show
    const variantTab = screen.getByRole('button', { name: /Variant-Specific/i });
    fireEvent.click(variantTab);
    expect(screen.queryByText('“Organic Tee Front View”')).not.toBeInTheDocument();
    expect(screen.getByText('“Navy Tee”')).toBeInTheDocument();
  });

  it('opens add media modal and submits new image asset', async () => {
    const newAsset: MediaAsset = {
      id: 'media_3',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'image',
      fileKey: 'products/tee-back.jpg',
      posterKey: null,
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      alt: { en: 'Back View' },
      position: 2,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockedCreateProductMedia.mockResolvedValue(newAsset);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const addBtn = screen.getByRole('button', { name: 'Add Media' });
    fireEvent.click(addBtn);

    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileKeyInput = screen.getByPlaceholderText(/products\/antigravity-tee-navy\.jpg/i);
    fireEvent.change(fileKeyInput, { target: { value: 'products/tee-back.jpg' } });

    const altInput = screen.getByPlaceholderText(/Descriptive text for screen readers/i);
    fireEvent.change(altInput, { target: { value: 'Back View' } });

    const submitBtn = screen.getByRole('button', { name: 'Add Media' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateProductMedia).toHaveBeenCalledWith(
        'prod_1',
        expect.objectContaining({
          kind: 'image',
          fileKey: 'products/tee-back.jpg',
          alt: { en: 'Back View' },
          status: 'active',
        }),
      );
    });
  });

  it('handles reordering moving asset left/right', async () => {
    mockedReorderProductMedia.mockResolvedValue([sampleAssets[1]!, sampleAssets[0]!]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const moveRightBtn = screen.getByRole('button', { name: 'Move Right' });
    fireEvent.click(moveRightBtn);

    await waitFor(() => {
      expect(mockedReorderProductMedia).toHaveBeenCalledWith('prod_1', {
        mediaAssetIds: ['media_2', 'media_1'],
      });
    });
  });

  it('tags an untagged asset to an option value', async () => {
    mockedPutMediaTag.mockResolvedValue({
      ...sampleAssets[0]!,
      tags: [
        {
          optionTypeId: 'ot_color',
          optionTypeCode: 'color',
          optionValueId: 'val_navy',
          code: 'navy',
        },
      ],
    });

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const colorSelect = screen.getAllByRole('combobox', { name: 'Tag Color' })[0]!;
    fireEvent.change(colorSelect, { target: { value: 'val_navy' } });

    await waitFor(() => {
      expect(mockedPutMediaTag).toHaveBeenCalledWith('media_1', 'ot_color', {
        optionValueId: 'val_navy',
      });
    });
  });

  it('removes tag from a tagged asset when set to untagged', async () => {
    mockedDeleteMediaTag.mockResolvedValue();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const colorSelect = screen.getAllByRole('combobox', { name: 'Tag Color' })[1]!;
    fireEvent.change(colorSelect, { target: { value: '' } });

    await waitFor(() => {
      expect(mockedDeleteMediaTag).toHaveBeenCalledWith('media_2', 'ot_color');
    });
  });

  it('confirms hard delete via confirmation modal', async () => {
    mockedDeleteMedia.mockResolvedValue();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtns[0]!);

    const confirmDialog = await screen.findByRole('dialog', {
      name: /Permanently delete this media asset/i,
    });
    expect(confirmDialog).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedDeleteMedia).toHaveBeenCalledWith('media_1');
    });
  });

  it('disables mutation controls when product is archived', async () => {
    const archivedProduct: Product = {
      ...sampleProduct,
      status: 'archived',
      archivedAt: '2026-01-02T00:00:00.000Z',
    };

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={archivedProduct} />);

    await screen.findByText('Product Media Gallery');

    expect(
      screen.getByText('This product is archived. Media is displayed in read-only mode.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Media' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Right' })).not.toBeInTheDocument();
  });

  it('triggers two-way navigation callbacks for Variants and Options', async () => {
    const onManageVariants = vi.fn();
    const onConfigureOptions = vi.fn();

    renderAdmin(
      <ProductMediaDialog
        open
        onOpenChange={vi.fn()}
        product={sampleProduct}
        onManageVariants={onManageVariants}
        onConfigureOptions={onConfigureOptions}
      />,
    );

    await screen.findByText('Product Media Gallery');

    const variantsNavBtn = screen.getByRole('button', { name: '← Manage Variants' });
    fireEvent.click(variantsNavBtn);
    expect(onManageVariants).toHaveBeenCalledWith(sampleProduct);

    const optionsNavBtn = screen.getByRole('button', { name: '← Configure Options' });
    fireEvent.click(optionsNavBtn);
    expect(onConfigureOptions).toHaveBeenCalledWith(sampleProduct);
  });
});
