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
  generatePosterCandidatesApi,
  listProductMedia,
  listProductOptions,
  putMediaTag,
  reorderProductMedia,
  requestUploadUrl,
  updateMedia,
  uploadFileToPresignedUrl,
} from './api';
import {
  ProductMediaDialog,
  getFriendlyMediaLabel,
  readVideoDuration,
} from './product-media-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listProductMedia: vi.fn(),
    listProductOptions: vi.fn(),
    createProductMedia: vi.fn(),
    updateMedia: vi.fn(),
    deleteMedia: vi.fn(),
    putMediaTag: vi.fn(),
    deleteMediaTag: vi.fn(),
    reorderProductMedia: vi.fn(),
    requestUploadUrl: vi.fn(),
    uploadFileToPresignedUrl: vi.fn(),
    generatePosterCandidatesApi: vi.fn(),
  };
});

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

const mockedListProductMedia = vi.mocked(listProductMedia);
const mockedListProductOptions = vi.mocked(listProductOptions);
const mockedCreateProductMedia = vi.mocked(createProductMedia);
const mockedUpdateMedia = vi.mocked(updateMedia);
const mockedDeleteMedia = vi.mocked(deleteMedia);
const mockedPutMediaTag = vi.mocked(putMediaTag);
const mockedDeleteMediaTag = vi.mocked(deleteMediaTag);
const mockedReorderProductMedia = vi.mocked(reorderProductMedia);
const mockedRequestUploadUrl = vi.mocked(requestUploadUrl);
const mockedUploadFileToPresignedUrl = vi.mocked(uploadFileToPresignedUrl);
const mockedGeneratePosterCandidatesApi = vi.mocked(generatePosterCandidatesApi);
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
    posterCandidates: [],
    posterCandidateUrls: [],
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
    posterCandidates: [],
    posterCandidateUrls: [],
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
    mockedGeneratePosterCandidatesApi.mockResolvedValue({ candidates: [] });
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      // New asset immediately appears in the gallery in-place
      expect(screen.getByText('“Back View”')).toBeInTheDocument();
    });

    // Zero redundant full-list network requests
    expect(mockedListProductMedia).toHaveBeenCalledTimes(1);
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
      posterCandidates: [],
      posterCandidateUrls: [],
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

  it('validates malformed fileKey and posterKey, rejecting spaces and invalid formats', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileKeyInput = screen.getByPlaceholderText(/products\/antigravity-tee-navy\.jpg/i);
    const submitBtn = screen.getByRole('button', { name: 'Add Media' });

    // Enter a malformed fileKey with spaces
    fireEvent.change(fileKeyInput, { target: { value: 'not a valid url or storage key.jpg' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Must be a valid URL (http/https) or storage key path (no spaces).'),
      ).toBeInTheDocument();
    });
    expect(mockedCreateProductMedia).not.toHaveBeenCalled();

    // Enter valid URL format and ensure error clears
    fireEvent.change(fileKeyInput, {
      target: { value: 'https://cdn.example.com/products/valid.jpg' },
    });
    mockedCreateProductMedia.mockResolvedValueOnce({
      id: 'media_url',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'image',
      fileKey: 'https://cdn.example.com/products/valid.jpg',
      posterKey: null,
      posterCandidates: [],
      posterCandidateUrls: [],
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      alt: null,
      position: 0,
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
          fileKey: 'https://cdn.example.com/products/valid.jpg',
        }),
      );
    });
  });

  it('displays live alt text counter and enforces 200 character limit', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    // Initial counter is 0/200
    expect(screen.getByText('0/200')).toBeInTheDocument();

    const altInput = screen.getByPlaceholderText(/Descriptive text for screen readers/i);
    fireEvent.change(altInput, { target: { value: 'Short description' } });

    // Counter updates to 17/200
    expect(screen.getByText('17/200')).toBeInTheDocument();

    // Max length attribute is set to 200
    expect(altInput).toHaveAttribute('maxLength', '200');
  });

  it('uploads file via presigned URL pipeline and sets fileKey automatically', async () => {
    mockedRequestUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'http://localhost:4000/admin/v1/storage/upload?token=test',
      fileKey: 'product/prod_1/12345-tee-navy.jpg',
      publicUrl: 'http://localhost:4000/uploads/product/prod_1/12345-tee-navy.jpg',
    });
    mockedUploadFileToPresignedUrl.mockResolvedValueOnce();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fakeFile = new File([fakeJpegBytes], 'tee-navy.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(mockedRequestUploadUrl).toHaveBeenCalledWith({
        fileName: 'tee-navy.jpg',
        contentType: 'image/jpeg',
        ownerType: 'product',
        ownerId: 'prod_1',
      });
      expect(mockedUploadFileToPresignedUrl).toHaveBeenCalledWith(
        'http://localhost:4000/admin/v1/storage/upload?token=test',
        fakeFile,
        expect.any(Function),
      );
    });

    // The fileKey input has automatically been populated
    const fileKeyInput = screen.getByPlaceholderText(/products\/antigravity-tee-navy\.jpg/i);
    expect(fileKeyInput).toHaveValue('product/prod_1/12345-tee-navy.jpg');

    // Submit the form
    mockedCreateProductMedia.mockResolvedValueOnce({
      id: 'media_uploaded',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'image',
      fileKey: 'product/prod_1/12345-tee-navy.jpg',
      posterKey: null,
      posterCandidates: [],
      posterCandidateUrls: [],
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      alt: null,
      position: 0,
      status: 'active',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const submitBtn = screen.getByRole('button', { name: 'Add Media' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedCreateProductMedia).toHaveBeenCalledWith(
        'prod_1',
        expect.objectContaining({
          fileKey: 'product/prod_1/12345-tee-navy.jpg',
        }),
      );
    });
  });

  it('locks fileKey field as read-only after dropzone upload and unlocks on file removal', async () => {
    mockedRequestUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'http://localhost:4000/admin/v1/storage/upload?token=test',
      fileKey: 'product/prod_1/locked-file.jpg',
      publicUrl: 'http://localhost:4000/uploads/product/prod_1/locked-file.jpg',
    });
    mockedUploadFileToPresignedUrl.mockResolvedValueOnce();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileKeyInput = screen.getByPlaceholderText(/products\/antigravity-tee-navy\.jpg/i);
    // Before upload, fileKey is editable
    expect(fileKeyInput).not.toHaveAttribute('readonly');

    const fileInput = screen.getByTestId('media-file-input');
    const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fakeFile = new File([fakeJpegBytes], 'sample.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(fileKeyInput).toHaveValue('product/prod_1/locked-file.jpg');
      expect(fileKeyInput).toHaveAttribute('readonly');
    });

    // Confirmation locked hint is displayed
    expect(
      screen.getByText(/Locked to uploaded file\. Click the remove button above/i),
    ).toBeInTheDocument();

    // Click the remove button on the upload preview
    const removeBtn = screen.getByRole('button', { name: 'Change file' });
    fireEvent.click(removeBtn);

    // fileKey is cleared and unlocked for manual typing
    expect(fileKeyInput).toHaveValue('');
    expect(fileKeyInput).not.toHaveAttribute('readonly');
    expect(
      screen.queryByText(/Locked to uploaded file\. Click the remove button above/i),
    ).not.toBeInTheDocument();
  });

  it('rejects files larger than 50MB with localized error', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const largeFile = new File(['x'], 'huge-video.mp4', { type: 'video/mp4' });
    Object.defineProperty(largeFile, 'size', { value: 60 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText('File exceeds maximum size (50MB).')).toBeInTheDocument();
    });
    expect(mockedRequestUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects video files exceeding 120s duration with localized error', async () => {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'video') {
          let _src = '';
          Object.defineProperty(el, 'src', {
            get: () => _src,
            set: (val: string) => {
              _src = val;
              Object.defineProperty(el, 'duration', { value: 135, configurable: true });
              setTimeout(() => {
                (el as HTMLVideoElement).onloadedmetadata?.(new Event('loadedmetadata'));
              }, 0);
            },
            configurable: true,
          });
        }
        return el;
      },
    );

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const videoFile = new File([mp4Bytes], 'long-clip.mp4', { type: 'video/mp4' });

    fireEvent.change(fileInput, { target: { files: [videoFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Video duration exceeds the 120-second limit (135s). Please upload a shorter video.',
        ),
      ).toBeInTheDocument();
    });
    expect(mockedRequestUploadUrl).not.toHaveBeenCalled();
  });

  it('accepts video files with duration <= 120s and automatically sets durationS field', async () => {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'video') {
          let _src = '';
          Object.defineProperty(el, 'src', {
            get: () => _src,
            set: (val: string) => {
              _src = val;
              Object.defineProperty(el, 'duration', { value: 45, configurable: true });
              setTimeout(() => {
                (el as HTMLVideoElement).onloadedmetadata?.(new Event('loadedmetadata'));
              }, 0);
            },
            configurable: true,
          });
        }
        return el;
      },
    );

    mockedRequestUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'http://localhost:4000/admin/v1/storage/upload?token=test',
      fileKey: 'product/prod_1/12345-clip.mp4',
      publicUrl: 'http://localhost:4000/uploads/product/prod_1/12345-clip.mp4',
    });
    mockedUploadFileToPresignedUrl.mockResolvedValueOnce();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const videoFile = new File([mp4Bytes], 'valid-clip.mp4', { type: 'video/mp4' });

    fireEvent.change(fileInput, { target: { files: [videoFile] } });

    await waitFor(() => {
      expect(mockedRequestUploadUrl).toHaveBeenCalled();
    });

    const durationInput = screen.getByPlaceholderText('e.g. 45');
    expect(durationInput).toHaveValue(45);
  });

  describe('readVideoDuration helper', () => {
    it('resolves duration when metadata loads successfully', async () => {
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string, options?: ElementCreationOptions) => {
          const el = origCreateElement(tagName, options);
          if (tagName.toLowerCase() === 'video') {
            let _src = '';
            Object.defineProperty(el, 'src', {
              get: () => _src,
              set: (val: string) => {
                _src = val;
                Object.defineProperty(el, 'duration', { value: 60, configurable: true });
                setTimeout(() => {
                  (el as HTMLVideoElement).onloadedmetadata?.(new Event('loadedmetadata'));
                }, 0);
              },
              configurable: true,
            });
          }
          return el;
        },
      );

      const fakeFile = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
      const duration = await readVideoDuration(fakeFile);
      expect(duration).toBe(60);
    });

    it('rejects when metadata loading encounters error', async () => {
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string, options?: ElementCreationOptions) => {
          const el = origCreateElement(tagName, options);
          if (tagName.toLowerCase() === 'video') {
            let _src = '';
            Object.defineProperty(el, 'src', {
              get: () => _src,
              set: (val: string) => {
                _src = val;
                setTimeout(() => {
                  (el as HTMLVideoElement).onerror?.(new Event('error'));
                }, 0);
              },
              configurable: true,
            });
          }
          return el;
        },
      );

      const fakeFile = new File(['dummy'], 'corrupt.mp4', { type: 'video/mp4' });
      await expect(readVideoDuration(fakeFile)).rejects.toThrow('Failed to load video metadata');
    });
  });

  it('rejects file upload with invalid magic bytes', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const invalidFile = new File(['plain-text-not-an-image'], 'fake-image.jpg', {
      type: 'image/jpeg',
    });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Invalid file format. Please upload a supported image (PNG, JPG, WebP, AVIF, GIF) or video (MP4, WebM).',
        ),
      ).toBeInTheDocument();
    });
    expect(mockedRequestUploadUrl).not.toHaveBeenCalled();
  });

  it('detects video magic bytes and syncs kind to video', async () => {
    mockedRequestUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'http://localhost:4000/admin/v1/storage/upload?token=test',
      fileKey: 'product/prod_1/clip.mp4',
      publicUrl: 'http://localhost:4000/uploads/product/prod_1/clip.mp4',
    });
    mockedUploadFileToPresignedUrl.mockResolvedValueOnce();

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    const mp4Bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x6d,
      0x70,
      0x34,
      0x32, // mp42
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    const videoFile = new File([mp4Bytes], 'clip.mp4', { type: 'video/mp4' });

    fireEvent.change(fileInput, { target: { files: [videoFile] } });

    await waitFor(() => {
      expect(mockedRequestUploadUrl).toHaveBeenCalledWith({
        fileName: 'clip.mp4',
        contentType: 'video/mp4',
        ownerType: 'product',
        ownerId: 'prod_1',
      });
    });

    // Poster Key field should now be present since kind switched to video
    expect(screen.getByText('Video Poster Thumbnail URL')).toBeInTheDocument();
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
        posterCandidates: [],
        posterCandidateUrls: [],
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
        posterCandidates: [],
        posterCandidateUrls: [],
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
        posterCandidates: [],
        posterCandidateUrls: [],
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
        posterCandidates: [],
        posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
    expect(screen.getByText(/45s •/i)).toBeInTheDocument();
    const friendlyVideoLabel = screen.getByText('tee-promo.mp4');
    expect(friendlyVideoLabel).toBeInTheDocument();
    expect(friendlyVideoLabel).toHaveAttribute('title', 'products/tee-promo.mp4');

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
      posterCandidates: [],
      posterCandidateUrls: [],
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

    // Error fallback is displayed with localized message and friendly file label with tooltip
    const errContainer = await screen.findByTestId('video-load-error');
    expect(errContainer).toBeInTheDocument();
    expect(within(errContainer).getByText(/Unable to load video preview/i)).toBeInTheDocument();
    const errLabel = within(errContainer).getByText('invalid-video.mp4');
    expect(errLabel).toBeInTheDocument();
    expect(errLabel).toHaveAttribute('title', 'products/invalid-video.mp4');
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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
      posterCandidates: [],
      posterCandidateUrls: [],
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

  it('displays human-friendly 1-based position numbers in card headers', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');
    expect(screen.getByText('pos 1')).toBeInTheDocument();
    expect(screen.getByText('pos 2')).toBeInTheDocument();
    expect(screen.queryByText('pos 0')).not.toBeInTheDocument();
  });

  it('hides Edit details button in video preview modal when product is archived', async () => {
    const archivedProduct: Product = {
      ...sampleProduct,
      status: 'archived',
    };
    const videoAsset: MediaAsset = {
      id: 'media_v1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/video-1.mp4',
      posterKey: 'products/poster-1.jpg',
      posterCandidates: [],
      posterCandidateUrls: [],
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

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={archivedProduct} />);

    await screen.findByText('Product Media Gallery');

    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    expect(await screen.findByTestId('video-preview-player')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit details/i })).not.toBeInTheDocument();
  });

  it('closes Edit Media Asset without API call when submitted without changes', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const editBtns = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editBtns[0]!);

    expect(await screen.findByRole('heading', { name: /Edit Media Asset/i })).toBeInTheDocument();

    // Click Save Media without modifying any fields
    const saveBtn = screen.getByRole('button', { name: /Save Media/i });
    fireEvent.click(saveBtn);

    // Modal should close immediately without calling updateMedia
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Edit Media Asset/i })).not.toBeInTheDocument();
    });
  });

  it('prompts with discard confirmation dialog when closing form modal with dirty changes', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const addBtn = screen.getByRole('button', { name: /Add Media/i });
    fireEvent.click(addBtn);

    expect(await screen.findByRole('heading', { name: /Add Media Asset/i })).toBeInTheDocument();

    const fileInput = screen.getByLabelText(/File Key \/ Asset URL/i);
    fireEvent.change(fileInput, { target: { value: 'products/unsaved.jpg' } });

    // Click Cancel while form is dirty
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    // Should prompt with discard confirmation dialog
    expect(await screen.findByText(/Discard changes\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You have unsaved changes\. If you close now, they will be lost\./i),
    ).toBeInTheDocument();

    // Confirm discard
    const discardConfirmBtn = screen.getByRole('button', { name: /Discard/i });
    fireEvent.click(discardConfirmBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Add Media Asset/i })).not.toBeInTheDocument();
    });
  });

  it('closes delete confirm modal and displays error message if delete fails', async () => {
    const { AdminApiError } = await import('@/features/admin-api/client');
    mockedDeleteMedia.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtns[0]!);

    const confirmDialog = await screen.findByRole('dialog', {
      name: /Permanently delete this media asset/i,
    });
    expect(confirmDialog).toBeInTheDocument();

    const confirmDeleteBtn = within(confirmDialog).getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmDeleteBtn);

    // Confirm modal should close
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Permanently delete this media asset/i }),
      ).not.toBeInTheDocument();
    });

    // Error banner should be visible in parent gallery
    expect(
      await screen.findByText(/That action conflicts with the current state/i),
    ).toBeInTheDocument();
  });

  it('hides reorder controls when viewing filtered tabs (General or Variant-Specific)', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    // On All tab, move buttons are present
    expect(screen.getByRole('button', { name: 'Move Right' })).toBeInTheDocument();

    // Switch to General tab
    const generalTab = screen.getByRole('button', { name: /General/i });
    fireEvent.click(generalTab);

    // On General tab, move controls should be hidden
    expect(screen.queryByRole('button', { name: 'Move Right' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Left' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set as Cover/i })).not.toBeInTheDocument();
  });

  it('only displays Set as Cover button for untagged assets on the All tab', async () => {
    // sampleAssets has media_1 (untagged, isCover=true) and media_2 (tagged, isCover=false)
    // Add a third untagged asset at pos 2
    const threeAssets: MediaAsset[] = [
      ...sampleAssets,
      {
        id: 'media_3',
        ownerType: 'product',
        ownerId: 'prod_1',
        kind: 'image',
        fileKey: 'products/tee-back.jpg',
        posterKey: null,
        posterCandidates: [],
        posterCandidateUrls: [],
        width: 800,
        height: 800,
        durationS: null,
        blurhash: null,
        alt: { en: 'Back view' },
        position: 2,
        status: 'active',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockedListProductMedia.mockResolvedValueOnce(threeAssets);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    // media_1 is already cover -> no Make Cover button
    // media_2 is tagged (Variant Lead) -> MUST NOT have Make Cover button
    // media_3 is untagged and not cover -> MUST have Make Cover button
    const setCoverButtons = screen.getAllByRole('button', { name: /Make Cover/i });
    expect(setCoverButtons).toHaveLength(1);

    const media3Card = document.querySelector('[data-media-id="media_3"]')!;
    expect(
      within(media3Card as HTMLElement).getByRole('button', { name: /Make Cover/i }),
    ).toBeInTheDocument();

    const media2Card = document.querySelector('[data-media-id="media_2"]')!;
    expect(
      within(media2Card as HTMLElement).queryByRole('button', { name: /Make Cover/i }),
    ).not.toBeInTheDocument();
  });

  it('updates edited media asset in-place without triggering full list reload', async () => {
    const updatedAsset: MediaAsset = {
      ...sampleAssets[0]!,
      alt: { en: 'Updated Front View' },
    };
    mockedUpdateMedia.mockResolvedValueOnce(updatedAsset);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');
    expect(screen.getByText('“Organic Tee Front View”')).toBeInTheDocument();

    const editBtns = screen.getAllByRole('button', { name: 'Edit Media' });
    fireEvent.click(editBtns[0]!);

    expect(await screen.findByText('Edit Media Asset')).toBeInTheDocument();

    const altInput = screen.getByPlaceholderText(/Descriptive text for screen readers/i);
    fireEvent.change(altInput, { target: { value: 'Updated Front View' } });

    const saveBtn = screen.getByRole('button', { name: 'Save Media' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockedUpdateMedia).toHaveBeenCalledWith(
        'media_1',
        expect.objectContaining({
          alt: { en: 'Updated Front View' },
        }),
      );
      // DOM updates in-place to new value
      expect(screen.getByText('“Updated Front View”')).toBeInTheDocument();
    });

    // Zero redundant full-list network requests
    expect(mockedListProductMedia).toHaveBeenCalledTimes(1);
  });

  it('renders resolved absolute URL for media thumbnails with relative storage keys', async () => {
    const assetsWithUrl: MediaAsset[] = [
      {
        ...sampleAssets[0]!,
        id: 'media_url_1',
        fileKey: 'products/prod_1/image.png',
        url: 'http://localhost:4000/uploads/products/prod_1/image.png',
      },
      {
        ...sampleAssets[1]!,
        id: 'media_url_2',
        fileKey: 'https://cdn.example.com/products/prod_1/full-url.png',
        url: undefined,
      },
    ];
    mockedListProductMedia.mockResolvedValueOnce(assetsWithUrl);

    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const images = screen.getAllByRole('img');
    const firstImg = images.find((img) => img.getAttribute('src')?.includes('image.png'));
    expect(firstImg).toHaveAttribute(
      'src',
      'http://localhost:4000/uploads/products/prod_1/image.png',
    );

    const secondImg = images.find((img) => img.getAttribute('src')?.includes('full-url.png'));
    expect(secondImg).toHaveAttribute(
      'src',
      'https://cdn.example.com/products/prod_1/full-url.png',
    );
  });

  it('opens image inspection modal with magnifier on clicking image card or inspect button', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);

    await screen.findByText('Product Media Gallery');

    const inspectButtons = screen.getAllByRole('button', { name: 'Inspect image' });
    expect(inspectButtons.length).toBeGreaterThan(0);

    // Click inspect button for first image
    fireEvent.click(inspectButtons[0]!);

    // Inspection modal opens with magnifier container
    expect(await screen.findByTestId('image-magnifier-container')).toBeInTheDocument();
    expect(screen.getByText('Organic Tee Front View')).toBeInTheDocument();
    expect(screen.getByText('2.5x Zoom:')).toBeInTheDocument();

    // Adjust zoom level to 4x
    const zoom4x = screen.getByRole('button', { name: '4x' });
    fireEvent.click(zoom4x);
    expect(screen.getByText('4x Zoom:')).toBeInTheDocument();

    // Verify mode switcher toggles between Side preview and Loupe
    const loupeBtn = screen.getByRole('button', { name: 'Loupe' });
    fireEvent.click(loupeBtn);
    const sidePreviewBtn = screen.getByRole('button', { name: 'Side preview' });
    fireEvent.click(sidePreviewBtn);
    expect(screen.getByText('Magnifier Preview')).toBeInTheDocument();

    // Navigate to next image
    const nextBtn = screen.getByRole('button', { name: 'Next image' });
    fireEvent.click(nextBtn);
    expect(screen.getByText('Navy Tee')).toBeInTheDocument();

    // Close modal
    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeBtns[closeBtns.length - 1]!);
    expect(screen.queryByTestId('image-magnifier-container')).not.toBeInTheDocument();
  });

  it('updates dropzone accept attribute and hint text when toggling between image and video kinds', async () => {
    renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
    await screen.findByText('Product Media Gallery');

    fireEvent.click(screen.getByRole('button', { name: 'Add Media' }));
    expect(await screen.findByText('Add Media Asset')).toBeInTheDocument();

    const fileInput = screen.getByTestId('media-file-input');
    // Default is image kind
    expect(fileInput).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/avif,image/gif',
    );
    expect(screen.getByText('PNG, JPG, WebP, AVIF, GIF up to 50MB')).toBeInTheDocument();

    // Toggle to Video kind
    const videoBtn = screen.getByRole('button', { name: /Video/i });
    fireEvent.click(videoBtn);

    expect(fileInput).toHaveAttribute('accept', 'video/mp4,video/webm');
    expect(screen.getByText('MP4, WebM up to 50MB')).toBeInTheDocument();

    // Toggle back to Image kind
    const imageBtn = screen.getByRole('button', { name: /Image/i });
    fireEvent.click(imageBtn);

    expect(fileInput).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/avif,image/gif',
    );
    expect(screen.getByText('PNG, JPG, WebP, AVIF, GIF up to 50MB')).toBeInTheDocument();
  });

  it('applies responsive wrapping classes to preview modal headers and image inspection footer', async () => {
    const videoAsset: MediaAsset = {
      id: 'media_video_1',
      ownerType: 'product',
      ownerId: 'prod_1',
      kind: 'video',
      fileKey: 'products/tee-promo.mp4',
      posterKey: 'products/tee-promo-poster.jpg',
      posterCandidates: [],
      posterCandidateUrls: [],
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

    // 1. Check Image Inspection Modal header and footer responsiveness classes
    const inspectButtons = screen.getAllByRole('button', { name: 'Inspect image' });
    fireEvent.click(inspectButtons[0]!);

    expect(await screen.findByTestId('image-magnifier-container')).toBeInTheDocument();

    // Header has sm:flex-row wrapping and button group has flex-wrap
    const imageModalHeader =
      screen.getByText('Organic Tee Front View').closest('[class*="border-b"]') ??
      screen.getByText('Organic Tee Front View').parentElement?.parentElement;
    expect(imageModalHeader).toHaveClass(
      'flex-col',
      'sm:flex-row',
      'sm:items-center',
      'sm:justify-between',
    );

    const fullscreenBtn = screen.getByRole('button', { name: 'Fullscreen' });
    const headerBtnGroup = fullscreenBtn.parentElement;
    expect(headerBtnGroup).toHaveClass('flex-wrap');

    // Footer mode switcher has sm:border-l (no border on mobile when wrapped)
    const modeSwitcher = screen.getByRole('button', { name: 'Loupe' }).parentElement;
    expect(modeSwitcher).toHaveClass('sm:border-l', 'sm:border-border', 'sm:pl-3');

    // Close image inspection modal
    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeBtns[closeBtns.length - 1]!);

    // 2. Check Video Preview Modal header responsiveness classes
    const playBtn = screen.getByRole('button', { name: /Play video preview/i });
    fireEvent.click(playBtn);

    expect(await screen.findByText('Organic Tee Promo Reel')).toBeInTheDocument();
    const videoModalHeader =
      screen.getByText('Organic Tee Promo Reel').closest('[class*="border-b"]') ??
      screen.getByText('Organic Tee Promo Reel').parentElement?.parentElement;
    expect(videoModalHeader).toHaveClass(
      'flex-col',
      'sm:flex-row',
      'sm:items-center',
      'sm:justify-between',
    );

    const videoFullscreenBtn = screen.getByRole('button', { name: 'Fullscreen' });
    const videoHeaderBtnGroup = videoFullscreenBtn.parentElement;
    expect(videoHeaderBtnGroup).toHaveClass('flex-wrap');
  });

  describe('Video poster thumbnail candidates', () => {
    it('displays poster candidates on video upload and updates posterKey on selection', async () => {
      mockedListProductMedia.mockResolvedValue([]);
      mockedRequestUploadUrl.mockResolvedValue({
        uploadUrl: 'http://upload/presigned',
        fileKey: 'product/prod_1/123-video.mp4',
        publicUrl: 'http://cdn/123-video.mp4',
      });
      mockedUploadFileToPresignedUrl.mockResolvedValue();
      mockedGeneratePosterCandidatesApi.mockResolvedValue({
        candidates: [
          { key: 'product/prod_1/123-video-poster-cand-1.jpg', url: 'http://cdn/cand-1.jpg' },
          { key: 'product/prod_1/123-video-poster-cand-2.jpg', url: 'http://cdn/cand-2.jpg' },
          { key: 'product/prod_1/123-video-poster-cand-3.jpg', url: 'http://cdn/cand-3.jpg' },
        ],
      });
      mockedCreateProductMedia.mockResolvedValue({
        id: 'new_media_1',
        ownerType: 'product',
        ownerId: sampleProduct.id,
        kind: 'video',
        fileKey: 'product/prod_1/123-video.mp4',
        posterKey: 'product/prod_1/123-video-poster-cand-2.jpg',
        posterCandidates: [
          'product/prod_1/123-video-poster-cand-1.jpg',
          'product/prod_1/123-video-poster-cand-2.jpg',
          'product/prod_1/123-video-poster-cand-3.jpg',
        ],
        posterCandidateUrls: [
          'http://cdn/cand-1.jpg',
          'http://cdn/cand-2.jpg',
          'http://cdn/cand-3.jpg',
        ],
        width: 1920,
        height: 1080,
        durationS: 30,
        blurhash: null,
        alt: null,
        position: 0,
        status: 'active',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      renderAdmin(<ProductMediaDialog open onOpenChange={vi.fn()} product={sampleProduct} />);
      await screen.findByText('Product Media Gallery');

      // Click Add Media
      fireEvent.click(screen.getAllByRole('button', { name: 'Add Media' })[0]!);

      // Select Video Kind
      const videoKindBtn = screen.getByRole('button', { name: /video/i });
      fireEvent.click(videoKindBtn);

      await screen.findByText('Suggested Video Posters');

      // Simulate video file upload
      const fileInput = screen.getByTestId('media-file-input');
      const mp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
        0x00,
      ]);
      const file = new File([mp4Bytes], 'demo.mp4', { type: 'video/mp4' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Verify candidates generation endpoint is called
      await waitFor(() => {
        expect(mockedGeneratePosterCandidatesApi).toHaveBeenCalledWith(
          'product/prod_1/123-video.mp4',
        );
      });

      // Verify all 3 candidate thumbnails are displayed
      const candidatesGrid = await screen.findByTestId('poster-candidates-grid');
      expect(candidatesGrid).toBeInTheDocument();
      const candidateButtons = within(candidatesGrid).getAllByRole('button');
      expect(candidateButtons).toHaveLength(3);

      // Candidate 1 is automatically selected initially
      const posterInput = screen.getByLabelText(/Video Poster Thumbnail URL/i) as HTMLInputElement;
      expect(posterInput.value).toBe('product/prod_1/123-video-poster-cand-1.jpg');

      // Click candidate 2 to pick it
      fireEvent.click(candidateButtons[1]!);
      expect(posterInput.value).toBe('product/prod_1/123-video-poster-cand-2.jpg');

      // Manual input field still accepts typing independently
      fireEvent.change(posterInput, {
        target: { value: 'https://cdn.example.com/custom-poster.jpg' },
      });
      expect(posterInput.value).toBe('https://cdn.example.com/custom-poster.jpg');

      // Switch back by clicking candidate 2
      fireEvent.click(candidateButtons[1]!);
      expect(posterInput.value).toBe('product/prod_1/123-video-poster-cand-2.jpg');

      // Save media
      const modalAddBtns = screen.getAllByRole('button', { name: 'Add Media' });
      fireEvent.click(modalAddBtns[modalAddBtns.length - 1]!);
      await waitFor(() => {
        expect(mockedCreateProductMedia).toHaveBeenCalledWith(
          sampleProduct.id,
          expect.objectContaining({
            kind: 'video',
            fileKey: 'product/prod_1/123-video.mp4',
            posterKey: 'product/prod_1/123-video-poster-cand-2.jpg',
            posterCandidates: [
              'product/prod_1/123-video-poster-cand-1.jpg',
              'product/prod_1/123-video-poster-cand-2.jpg',
              'product/prod_1/123-video-poster-cand-3.jpg',
            ],
          }),
        );
      });
    });
  });
});

describe('getFriendlyMediaLabel', () => {
  it('returns empty string for empty or falsy inputs', () => {
    expect(getFriendlyMediaLabel('')).toBe('');
    expect(getFriendlyMediaLabel(null)).toBe('');
    expect(getFriendlyMediaLabel(undefined)).toBe('');
  });

  it('returns clean file name as is', () => {
    expect(getFriendlyMediaLabel('front-view.jpg')).toBe('front-view.jpg');
    expect(getFriendlyMediaLabel('video.mp4')).toBe('video.mp4');
  });

  it('extracts filename from nested storage paths', () => {
    expect(getFriendlyMediaLabel('products/tee-front.jpg')).toBe('tee-front.jpg');
    expect(getFriendlyMediaLabel('catalog/products/prod_1/gallery/photo.png')).toBe('photo.png');
  });

  it('strips internal timestamp and hash prefix', () => {
    expect(getFriendlyMediaLabel('1730812345-a1b2c3d4-front-view.jpg')).toBe('front-view.jpg');
    expect(getFriendlyMediaLabel('products/1730812345-a1b2c3d4-front-view.jpg')).toBe(
      'front-view.jpg',
    );
    expect(getFriendlyMediaLabel('products/1730812345-A1B2C3D4-hero-image.webp')).toBe(
      'hero-image.webp',
    );
    expect(getFriendlyMediaLabel('uploads/1234567890-abcdef-file-with-dashes-in-name.png')).toBe(
      'file-with-dashes-in-name.png',
    );
  });

  it('extracts and decodes filename from external URLs', () => {
    expect(
      getFriendlyMediaLabel('https://cdn.example.com/images/1730812345-a1b2c3d4-front-view.jpg'),
    ).toBe('front-view.jpg');
    expect(
      getFriendlyMediaLabel('https://cdn.example.com/path/to/clean-photo.png?v=2#details'),
    ).toBe('clean-photo.png');
    expect(getFriendlyMediaLabel('http://storage.local/media/encoded%20file%20name.jpg')).toBe(
      'encoded file name.jpg',
    );
  });
});
