import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  plainTextToDoc,
  type MediaAsset,
  type OptionType,
  type Product,
  type ProductOption,
} from '@shopnetic/contracts';
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
  description: { en: plainTextToDoc('Comfortable tee') },
  slug: 'organic-tee',
  status: 'active',
  basePriceMinor: '2999',
  currency: 'USD',
  spec: {},
  proposedBySellerId: null,
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
    hasSwatch: false,
    status: 'active',
    archived: false,
    values: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleProductOptions: ProductOption[] = [
  {
    productId: 'prod_1',
    optionTypeId: 'ot_color',
    optionTypeCode: 'color',
    position: 0,
    requiredValueId: null,
    values: [
      { optionValueId: 'val_navy', code: 'navy', position: 0 },
      { optionValueId: 'val_black', code: 'black', position: 1 },
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

  it('renders media gallery items with cover and variant lead badges', async () => {
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

  it('validates required fields inline (fileKey and video posterKey) and blocks submit', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const addBtn = screen.getByRole('button', { name: 'Add Media' });
    fireEvent.click(addBtn);

    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: 'Add Media' });
    // Click submit with empty fileKey
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('File key or URL is required.')).toBeInTheDocument();
    });
    expect(mockedCreateProductMedia).not.toHaveBeenCalled();

    // Fill fileKey and switch to Video kind
    const fileKeyInput = screen.getByPlaceholderText(/products\/antigravity-tee-navy\.jpg/i);
    fireEvent.change(fileKeyInput, { target: { value: 'products/video.mp4' } });

    const videoKindBtn = screen.getByRole('button', { name: /video/i });
    fireEvent.click(videoKindBtn);

    // Click submit without posterKey
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Videos require a poster thumbnail URL for gallery preview.'),
      ).toBeInTheDocument();
    });
    expect(mockedCreateProductMedia).not.toHaveBeenCalled();

    // Now fill posterKey and test duration boundary (0 is invalid: >= 1 required)
    const posterInput = screen.getByPlaceholderText(/products\/video-poster\.jpg/i);
    fireEvent.change(posterInput, { target: { value: 'products/poster.jpg' } });

    const durationInput = screen.getByPlaceholderText('e.g. 45');
    fireEvent.change(durationInput, { target: { value: '0' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Duration must be a positive number of seconds/i),
      ).toBeInTheDocument();
    });
    expect(mockedCreateProductMedia).not.toHaveBeenCalled();

    // Now enter valid duration (120s) and verify successful submit
    fireEvent.change(durationInput, { target: { value: '120' } });
    mockedCreateProductMedia.mockResolvedValueOnce({
      id: 'media_new',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video.mp4',
      posterKey: 'products/poster.jpg',
      width: null,
      height: null,
      durationS: 120,
      blurhash: null,
      alt: null,
      position: 1,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateProductMedia).toHaveBeenCalledWith(
        'prod_1',
        expect.objectContaining({
          kind: 'video',
          fileKey: 'products/video.mp4',
          posterKey: 'products/poster.jpg',
          durationS: 120,
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
    fireEvent.click(colorSelect);
    fireEvent.click(screen.getByRole('option', { name: 'navy' }));

    await waitFor(() => {
      expect(mockedPutMediaTag).toHaveBeenCalledWith('media_1', 'ot_color', {
        optionValueId: 'val_navy',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  it('removes tag from a tagged asset when set to untagged', async () => {
    mockedDeleteMediaTag.mockResolvedValue();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const colorSelect = screen.getAllByRole('combobox', { name: 'Tag Color' })[1]!;
    fireEvent.click(colorSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Untagged (All variants)' }));

    await waitFor(() => {
      expect(mockedDeleteMediaTag).toHaveBeenCalledWith('media_2', 'ot_color');
    });
  });

  it('renders option tag select trigger with min-w-0 and flex-1 to prevent cell overflow', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const triggers = screen.getAllByRole('combobox', { name: /Tag / });
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) {
      expect(trigger.className).toContain('min-w-0');
      expect(trigger.className).toContain('flex-1');
    }
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

    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(
      screen.getByText('This product is archived. Media is displayed in read-only mode.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Media' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Right' })).not.toBeInTheDocument();
  });

  it('disables mutation controls when product is pending review', async () => {
    const pendingProduct: Product = {
      ...sampleProduct,
      status: 'pending',
      archivedAt: null,
    };

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={pendingProduct} />);

    await screen.findByText('Product Media Gallery');

    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(
      screen.getByText('This product is awaiting review. Media is displayed in read-only mode.'),
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

  it('derives product cover for the first untagged asset and variant lead for the first asset per option value', async () => {
    const multipleAssets: MediaAsset[] = [
      {
        id: 'media_cover',
        ownerType: 'product',
        ownerId: 'prod_1',
        kind: 'image',
        fileKey: 'products/cover-front.jpg',
        posterKey: null,
        width: 800,
        height: 800,
        durationS: null,
        blurhash: null,
        alt: { en: 'Front Cover' },
        position: 0,
        status: 'active',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'media_second_untagged',
        ownerType: 'product',
        ownerId: 'prod_1',
        kind: 'image',
        fileKey: 'products/second-front.jpg',
        posterKey: null,
        width: 800,
        height: 800,
        durationS: null,
        blurhash: null,
        alt: { en: 'Secondary Front' },
        position: 1,
        status: 'active',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'media_navy_lead',
        ownerType: 'product',
        ownerId: 'prod_1',
        kind: 'image',
        fileKey: 'products/navy-primary.jpg',
        posterKey: null,
        width: 800,
        height: 800,
        durationS: null,
        blurhash: null,
        alt: { en: 'Navy Primary' },
        position: 2,
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
      {
        id: 'media_navy_secondary',
        ownerType: 'product',
        ownerId: 'prod_1',
        kind: 'image',
        fileKey: 'products/navy-detail.jpg',
        posterKey: null,
        width: 800,
        height: 800,
        durationS: null,
        blurhash: null,
        alt: { en: 'Navy Detail' },
        position: 3,
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

    mockedListProductMedia.mockResolvedValue(multipleAssets);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    expect(await screen.findByText('Product Media Gallery')).toBeInTheDocument();

    const coverCard = document.querySelector('[data-media-id="media_cover"]')!;
    const secondUntaggedCard = document.querySelector('[data-media-id="media_second_untagged"]')!;
    const navyLeadCard = document.querySelector('[data-media-id="media_navy_lead"]')!;
    const navySecondaryCard = document.querySelector('[data-media-id="media_navy_secondary"]')!;

    expect(coverCard).toBeInTheDocument();
    expect(secondUntaggedCard).toBeInTheDocument();
    expect(navyLeadCard).toBeInTheDocument();
    expect(navySecondaryCard).toBeInTheDocument();

    // First untagged has Product Cover; second untagged does NOT
    expect(within(coverCard as HTMLElement).getByText('Product Cover')).toBeInTheDocument();
    expect(
      within(secondUntaggedCard as HTMLElement).queryByText('Product Cover'),
    ).not.toBeInTheDocument();

    // First Navy tagged has Variant Lead; second Navy tagged does NOT
    expect(within(navyLeadCard as HTMLElement).getByText('Variant Lead')).toBeInTheDocument();
    expect(
      within(navySecondaryCard as HTMLElement).queryByText('Variant Lead'),
    ).not.toBeInTheDocument();
  });

  it('renders responsive structure with pr-10 header and overflow-x-auto filter tabs', async () => {
    mockedListProductMedia.mockResolvedValue([]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    expect(await screen.findByText('Product Media Gallery')).toBeInTheDocument();

    const modalHeader = document.querySelector('[class*="pr-10"]');
    expect(modalHeader).toBeInTheDocument();
    const filterTabsContainer = document.querySelector('.overflow-x-auto');
    expect(filterTabsContainer).toBeInTheDocument();
  });

  it('opens video preview modal on clicking play button and unmounts video on close', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_video_1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/tee-promo.mp4',
      posterKey: 'products/tee-promo-poster.jpg',
      width: 1920,
      height: 1080,
      durationS: 45,
      blurhash: null,
      alt: { en: 'Organic Tee Promo Reel' },
      position: 2,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([...sampleAssets, videoAsset]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    // Video duration badge is rendered on the card
    expect(screen.getByText('45s')).toBeInTheDocument();

    // Click play preview button
    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);

    // Modal title & video element are rendered
    expect(await screen.findByText('Organic Tee Promo Reel')).toBeInTheDocument();
    expect(screen.getByText(/45s • products\/tee-promo\.mp4/i)).toBeInTheDocument();

    const videoEl = screen.getByTestId('video-preview-player') as HTMLVideoElement;
    expect(videoEl).toBeInTheDocument();
    expect(videoEl).toHaveAttribute('src', 'products/tee-promo.mp4');
    expect(videoEl).toHaveAttribute('poster', 'products/tee-promo-poster.jpg');
    expect(videoEl).toHaveAttribute('controls');
    expect(videoEl).toHaveAttribute('autoplay');
    expect(videoEl.muted).toBe(true);

    // Speed selector buttons exist and clicking one updates playbackRate
    const speedBtn = screen.getByRole('button', { name: '1.5x' });
    expect(speedBtn).toBeInTheDocument();
    fireEvent.click(speedBtn);
    expect(videoEl.playbackRate).toBe(1.5);

    // Open original link exists
    const openOrigLink = screen.getByRole('link', { name: /Open original/i });
    expect(openOrigLink).toHaveAttribute('href', 'products/tee-promo.mp4');
    expect(openOrigLink).toHaveAttribute('target', '_blank');

    // Close preview modal via Close button
    const closeBtn = screen
      .getAllByRole('button', { name: /Close/i })
      .find((btn) => btn.closest('[role="dialog"]'));
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);

    // Video is unmounted from document
    await waitFor(() => {
      expect(screen.queryByTestId('video-preview-player')).not.toBeInTheDocument();
    });
  });

  it('renders graceful error container when video playback encounters an error', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_video_broken',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/invalid-video.mp4',
      posterKey: null,
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      alt: null,
      position: 2,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([videoAsset]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    const videoEl = await screen.findByTestId('video-preview-player');
    expect(videoEl).toBeInTheDocument();

    // Trigger video error
    fireEvent.error(videoEl);

    // Error fallback is displayed with localized message and fileKey
    const errContainer = await screen.findByTestId('video-load-error');
    expect(errContainer).toBeInTheDocument();
    expect(within(errContainer).getByText(/Unable to load video preview/i)).toBeInTheDocument();
    expect(within(errContainer).getByText('products/invalid-video.mp4')).toBeInTheDocument();
    expect(screen.queryByTestId('video-preview-player')).not.toBeInTheDocument();
  });

  it('navigates between multiple video assets using next/prev buttons', async () => {
    const video1: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/poster-1.jpg',
      width: 1920,
      height: 1080,
      durationS: 30,
      blurhash: null,
      alt: { en: 'First Video Reel' },
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const video2: MediaAsset = {
      id: 'media_v2',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-2.mp4',
      posterKey: 'products/poster-2.jpg',
      width: 1920,
      height: 1080,
      durationS: 60,
      blurhash: null,
      alt: { en: 'Second Video Reel' },
      position: 1,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([video1, video2]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playButtons = screen.getAllByRole('button', { name: /Play video preview/i });
    expect(playButtons).toHaveLength(2);

    // Play first video
    fireEvent.click(playButtons[0]!);

    expect(await screen.findByText('First Video Reel')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /Next video/i });
    expect(nextBtn).not.toBeDisabled();

    // Click Next
    fireEvent.click(nextBtn);

    expect(await screen.findByText('Second Video Reel')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /Previous video/i });
    expect(prevBtn).not.toBeDisabled();

    // Click Prev
    fireEvent.click(prevBtn);

    expect(await screen.findByText('First Video Reel')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('triggers fullscreen request on fullscreen button click', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/poster-1.jpg',
      width: 1920,
      height: 1080,
      durationS: 30,
      blurhash: null,
      alt: { en: 'Product Demo Reel' },
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([videoAsset]);

    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.requestFullscreen = requestFullscreenMock;

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    const fullscreenBtn = await screen.findByRole('button', { name: /Fullscreen/i });
    expect(fullscreenBtn).toBeInTheDocument();

    fireEvent.click(fullscreenBtn);
    expect(requestFullscreenMock).toHaveBeenCalled();
  });

  it('transitions from video preview to edit details modal on clicking Edit details', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/poster-1.jpg',
      width: 1920,
      height: 1080,
      durationS: 30,
      blurhash: null,
      alt: { en: 'Product Demo Reel' },
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([videoAsset]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    const editDetailsBtn = await screen.findByRole('button', { name: /Edit details/i });
    expect(editDetailsBtn).toBeInTheDocument();

    fireEvent.click(editDetailsBtn);

    // Should transition to Edit Media Asset modal
    expect(await screen.findByRole('heading', { name: /Edit Media Asset/i })).toBeInTheDocument();
  });

  it('transitions from video preview to edit details in MediaFormModal preserving asset details', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/video-1-poster.jpg',
      width: 1920,
      height: 1080,
      durationS: 30,
      blurhash: null,
      alt: { en: 'Product Demo Reel' },
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([videoAsset]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    const editDetailsBtn = await screen.findByRole('button', { name: /Edit details/i });
    fireEvent.click(editDetailsBtn);

    // MediaFormModal should now be open with existing posterKey preserved
    const posterInput = (await screen.findByLabelText(
      /Video Poster Thumbnail URL/i,
    )) as HTMLInputElement;
    expect(posterInput.value).toBe('products/video-1-poster.jpg');
  });

  it('resets video element playbackRate to 1 on asset change', async () => {
    const videoAsset1: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/poster-1.jpg',
      width: 1920,
      height: 1080,
      durationS: 30,
      blurhash: null,
      alt: { en: 'Video 1' },
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const videoAsset2: MediaAsset = {
      id: 'media_v2',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-2.mp4',
      posterKey: 'products/poster-2.jpg',
      width: 1920,
      height: 1080,
      durationS: 45,
      blurhash: null,
      alt: { en: 'Video 2' },
      position: 1,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListProductMedia.mockResolvedValue([videoAsset1, videoAsset2]);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtns = screen.getAllByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtns[0]!);

    const videoEl = (await screen.findByTestId('video-preview-player')) as HTMLVideoElement;
    expect(videoEl.playbackRate).toBe(1);

    // Change speed to 2x
    const speed2xBtn = screen.getByRole('button', { name: '2x' });
    fireEvent.click(speed2xBtn);
    expect(videoEl.playbackRate).toBe(2);

    // Navigate to next video asset
    const nextBtn = screen.getByRole('button', { name: /Next video/i });
    fireEvent.click(nextBtn);

    // Playback rate on DOM element and state should reset to 1
    expect(videoEl.playbackRate).toBe(1);
    expect(screen.getByRole('button', { name: '1x' })).toHaveClass('bg-primary');
  });
});
