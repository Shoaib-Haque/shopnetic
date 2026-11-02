import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  plainTextToDoc,
  type CategoryOption,
  type OptionType,
  type Product,
  type ProductOption,
  type Variant,
} from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { listCategoryOptions } from '@/features/catalog/categories/api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import {
  createVariant,
  deleteVariant,
  listProductOptions,
  listVariants,
  listVariantsPage,
  restoreVariant,
  updateVariant,
} from './api';
import { ProductVariantsDialog } from './product-variants-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listVariants: vi.fn(),
    listVariantsPage: vi.fn(),
    listProductOptions: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
    deleteVariant: vi.fn(),
    restoreVariant: vi.fn(),
  };
});

vi.mock('@/features/catalog/categories/api', () => ({
  listCategoryOptions: vi.fn(),
}));

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

const mockedListVariants = vi.mocked(listVariants);
const mockedListVariantsPage = vi.mocked(listVariantsPage);
const mockedListProductOptions = vi.mocked(listProductOptions);
const mockedCreateVariant = vi.mocked(createVariant);
const mockedUpdateVariant = vi.mocked(updateVariant);
const mockedDeleteVariant = vi.mocked(deleteVariant);
const mockedRestoreVariant = vi.mocked(restoreVariant);
const mockedListCategoryOptions = vi.mocked(listCategoryOptions);
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sizeOptionType: OptionType = {
  id: 'ot_size',
  code: 'size',
  name: { en: 'Size' },
  dataType: 'select',
  hasSwatch: false,
  status: 'active',
  archived: false,
  values: [
    {
      id: 'val_s',
      optionTypeId: 'ot_size',
      code: 's',
      label: { en: 'Small' },
      swatchHex: null,
      swatchImageKey: null,
      position: 0,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'val_m',
      optionTypeId: 'ot_size',
      code: 'm',
      label: { en: 'Medium' },
      swatchHex: null,
      swatchImageKey: null,
      position: 1,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const colorOptionType: OptionType = {
  id: 'ot_color',
  code: 'color',
  name: { en: 'Color' },
  dataType: 'select',
  hasSwatch: false,
  status: 'active',
  archived: false,
  values: [
    {
      id: 'val_navy',
      optionTypeId: 'ot_color',
      code: 'navy',
      label: { en: 'Navy' },
      swatchHex: null,
      swatchImageKey: null,
      position: 0,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'val_black',
      optionTypeId: 'ot_color',
      code: 'black',
      label: { en: 'Black' },
      swatchHex: null,
      swatchImageKey: null,
      position: 1,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const categoryOptions: CategoryOption[] = [
  {
    categoryId: 'cat_1',
    optionTypeId: 'ot_size',
    optionTypeCode: 'size',
    applicability: 'required',
    isVariantAxis: true,
    valueSource: 'open',
    valueSetId: null,
    priceImpact: false,
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const productOptions: ProductOption[] = [
  {
    productId: 'prod_1',
    optionTypeId: 'ot_size',
    optionTypeCode: 'size',
    position: 0,
    requiredValueId: null,
    values: [
      { optionValueId: 'val_s', code: 's', position: 0 },
      { optionValueId: 'val_m', code: 'm', position: 1 },
    ],
  },
];

const sampleVariant: Variant = {
  id: 'var_1',
  productId: 'prod_1',
  skuCode: 'TEE-S',
  gtin: '123456789012',
  weightG: 180,
  dims: { length: 250, width: 200, height: 15 },
  comboSignature: 'ot_size:val_s',
  status: 'active',
  position: 0,
  selections: [{ optionTypeId: 'ot_size', optionValueId: 'val_s' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductVariantsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListVariants.mockResolvedValue([sampleVariant]);
    mockedListVariantsPage.mockResolvedValue({
      variants: [sampleVariant],
      total: 1,
      nextCursor: undefined,
    });
    mockedListProductOptions.mockResolvedValue(productOptions);
    mockedListCategoryOptions.mockResolvedValue(categoryOptions);
    mockedListOptionTypesPage.mockResolvedValue({
      optionTypes: [sizeOptionType],
      nextCursor: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders variants table with combinations, SKU, GTIN, and status', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Product Variants')).toBeInTheDocument();
      expect(screen.getAllByText('Size: Small')[0]).toBeInTheDocument();
      expect(screen.getAllByText('TEE-S')[0]).toBeInTheDocument();
      expect(screen.getAllByText('123456789012')[0]).toBeInTheDocument();
      expect(screen.getAllByText('180g')[0]).toBeInTheDocument();
      expect(screen.getAllByText('250×200×15 mm')[0]).toBeInTheDocument();
      expect(screen.getAllByText('active')[0]).toBeInTheDocument();
    });
  });

  it('opens Cartesian matrix generator and generates new combinations', async () => {
    const createdVariant: Variant = {
      id: 'var_2',
      productId: 'prod_1',
      skuCode: 'PROD-M',
      gtin: null,
      weightG: null,
      dims: null,
      comboSignature: 'ot_size:val_m',
      status: 'active',
      position: 1,
      selections: [{ optionTypeId: 'ot_size', optionValueId: 'val_m' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockedCreateVariant.mockResolvedValue(createdVariant);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Variants' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Variants' }));

    await waitFor(() => {
      expect(screen.getByText('Generate Variant Matrix')).toBeInTheDocument();
      expect(screen.getByText('1 already exist.')).toBeInTheDocument();
      expect(screen.getByText('1 new available to generate.')).toBeInTheDocument();
    });

    // Enter SKU prefix
    fireEvent.change(screen.getByPlaceholderText('e.g. PROD-100-'), {
      target: { value: 'PROD-' },
    });

    // Click generate button
    fireEvent.click(screen.getByRole('button', { name: 'Generate 1 Variant' }));

    await waitFor(() => {
      expect(mockedCreateVariant).toHaveBeenCalledWith('prod_1', {
        selections: [{ optionTypeId: 'ot_size', optionValueId: 'val_m' }],
        skuCode: 'PROD-M',
        status: 'active',
        position: 1,
      });
      expect(screen.getByText('Size: Medium')).toBeInTheDocument();
    });
  });

  it('opens edit modal and updates variant fields', async () => {
    const updatedVariant: Variant = {
      ...sampleVariant,
      skuCode: 'TEE-S-UPDATED',
      weightG: 195,
    };
    mockedUpdateVariant.mockResolvedValue(updatedVariant);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
      expect(screen.getByDisplayValue('TEE-S')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('TEE-S'), {
      target: { value: 'TEE-S-UPDATED' },
    });
    fireEvent.change(screen.getByDisplayValue('180'), {
      target: { value: '195' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(mockedUpdateVariant).toHaveBeenCalledWith('prod_1', 'var_1', {
        skuCode: 'TEE-S-UPDATED',
        gtin: '123456789012',
        weightG: 195,
        dims: { length: 250, width: 200, height: 15 },
        status: 'active',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(screen.getAllByText('TEE-S-UPDATED')[0]).toBeInTheDocument();
    });
  });

  it('validates GTIN inline and blocks submission if invalid', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
      expect(screen.getByDisplayValue('123456789012')).toBeInTheDocument();
    });

    // Set invalid GTIN (too short, not 8-14 digits)
    fireEvent.change(screen.getByDisplayValue('123456789012'), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(screen.getByText('8 to 14 numeric digits (UPC, EAN, or ISBN).')).toBeInTheDocument();
    });

    expect(mockedUpdateVariant).not.toHaveBeenCalled();
  });

  it('validates dimensions are positive numbers (>0) and blocks saving 0', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    });

    // Enter 0 for width
    fireEvent.change(screen.getByDisplayValue('200'), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(
        screen.getByText('Dimensions must be positive whole numbers (greater than 0).'),
      ).toBeInTheDocument();
    });

    expect(mockedUpdateVariant).not.toHaveBeenCalled();
  });

  it('deletes a variant', async () => {
    mockedDeleteVariant.mockResolvedValue(undefined);
    mockedListVariants.mockResolvedValueOnce([sampleVariant]).mockResolvedValue([]);
    mockedListVariantsPage
      .mockResolvedValueOnce({ variants: [sampleVariant], total: 1, nextCursor: undefined })
      .mockResolvedValue({ variants: [], total: 0, nextCursor: undefined });

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Delete variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete variant' })[0]!);

    await waitFor(() => {
      expect(mockedDeleteVariant).toHaveBeenCalledWith('prod_1', 'var_1');
      expect(screen.queryByRole('row', { name: /TEE-S/ })).not.toBeInTheDocument();
    });
  });

  it('navigates back to configure options when requested', async () => {
    const onBackToOptions = vi.fn();
    const onOpenChange = vi.fn();

    renderAdmin(
      <ProductVariantsDialog
        open={true}
        onOpenChange={onOpenChange}
        product={sampleProduct}
        onBackToOptions={onBackToOptions}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '← Configure Options' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '← Configure Options' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onBackToOptions).toHaveBeenCalledWith(sampleProduct);
  });

  it('correctly identifies duplicate combinations across multiple options using pipe-delimited signatures', async () => {
    const multiCategoryOptions: CategoryOption[] = [
      {
        categoryId: 'cat_1',
        optionTypeId: 'ot_color',
        optionTypeCode: 'color',
        applicability: 'required',
        isVariantAxis: true,
        valueSource: 'open',
        valueSetId: null,
        priceImpact: false,
        position: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      categoryOptions[0]!,
    ];

    const multiProductOptions: ProductOption[] = [
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
      productOptions[0]!,
    ];

    // Existing variant with sorted pipe-delimited comboSignature
    const existingMultiVariant: Variant = {
      id: 'var_existing',
      productId: 'prod_1',
      skuCode: 'NAVY-S',
      gtin: null,
      weightG: null,
      dims: null,
      comboSignature: 'ot_color:val_navy|ot_size:val_s',
      status: 'active',
      position: 0,
      selections: [
        { optionTypeId: 'ot_color', optionValueId: 'val_navy' },
        { optionTypeId: 'ot_size', optionValueId: 'val_s' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockedListVariants.mockResolvedValue([existingMultiVariant]);
    mockedListVariantsPage.mockResolvedValue({
      variants: [existingMultiVariant],
      total: 1,
      nextCursor: undefined,
    });
    mockedListProductOptions.mockResolvedValue(multiProductOptions);
    mockedListCategoryOptions.mockResolvedValue(multiCategoryOptions);
    mockedListOptionTypesPage.mockResolvedValue({
      optionTypes: [colorOptionType, sizeOptionType],
      nextCursor: undefined,
    });

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Variants' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Variants' }));

    await waitFor(() => {
      expect(screen.getByText('Generate Variant Matrix')).toBeInTheDocument();
    });

    // 2 colors * 2 sizes = 4 total combinations.
    // 1 already exists (matched via '|' delimiter) and 3 new available to generate.
    expect(screen.getByText('1 already exist.')).toBeInTheDocument();
    expect(screen.getByText('3 new available to generate.')).toBeInTheDocument();
  });

  it('renders responsive structure with pr-10 header and min-w-[700px] table container', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Product Variants')).toBeInTheDocument();
    });

    const modalHeader = document.querySelector('[class*="pr-10"]');
    expect(modalHeader).toBeInTheDocument();
    const minWTable = document.querySelector('.min-w-\\[700px\\]');
    expect(minWTable).toBeInTheDocument();
    const footer = document.querySelector('[class*="flex-row flex-wrap"]');
    expect(footer).toBeInTheDocument();
  });

  it('resolves combination names from denormalized selections without raw UUIDs', async () => {
    const variantWithDenorm: Variant = {
      ...sampleVariant,
      id: 'var_denorm',
      selections: [
        {
          optionTypeId: '01a0b3eb-6700-7e53-88a0-df297e164d68',
          optionValueId: '01a0b3eb-6702-7f33-92d1-873ff3bef30b',
          optionTypeName: { en: 'Material' },
          optionTypeCode: 'material',
          optionValueLabel: { en: 'Cotton' },
          optionValueCode: 'cotton',
        },
      ],
    };
    mockedListVariants.mockResolvedValueOnce([variantWithDenorm]);
    mockedListVariantsPage.mockResolvedValueOnce({
      variants: [variantWithDenorm],
      total: 1,
      nextCursor: undefined,
    });

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Material: Cotton')[0]).toBeInTheDocument();
    });
    expect(screen.queryByText(/01a0b3eb-6700/)).not.toBeInTheDocument();
  });

  it('soft-deleting a variant displays an undo toast, and clicking Undo restores it', async () => {
    mockedListVariants
      .mockResolvedValueOnce([sampleVariant]) // mount
      .mockResolvedValueOnce([]) // after delete
      .mockResolvedValueOnce([sampleVariant]); // after undo/restore
    mockedListVariantsPage
      .mockResolvedValueOnce({ variants: [sampleVariant], total: 1, nextCursor: undefined })
      .mockResolvedValueOnce({ variants: [], total: 0, nextCursor: undefined })
      .mockResolvedValueOnce({ variants: [sampleVariant], total: 1, nextCursor: undefined });
    mockedListProductOptions.mockResolvedValue(productOptions);
    mockedListCategoryOptions.mockResolvedValue(categoryOptions);
    mockedListOptionTypesPage.mockResolvedValue({
      optionTypes: [sizeOptionType],
      nextCursor: undefined,
    });
    mockedDeleteVariant.mockResolvedValueOnce();
    mockedRestoreVariant.mockResolvedValueOnce(sampleVariant);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('TEE-S')[0]).toBeInTheDocument();
    });

    const deleteBtn = screen.getAllByRole('button', { name: 'Delete variant' })[0]!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockedDeleteVariant).toHaveBeenCalledWith('prod_1', 'var_1');
    });

    // Undo toast appears with Undo button
    const undoBtn = await screen.findByRole('button', { name: 'Undo' });
    fireEvent.click(undoBtn);

    await waitFor(() => {
      expect(mockedRestoreVariant).toHaveBeenCalledWith('prod_1', 'var_1');
    });
  });

  it('shows warning banner and explanation in GeneratorModal when variant axis has 0 values', async () => {
    const emptyAxisPo: ProductOption = {
      productId: 'prod_1',
      optionTypeId: 'ot_size',
      optionTypeCode: 'size',
      position: 0,
      requiredValueId: null,
      values: [],
    };
    mockedListProductOptions.mockResolvedValue([emptyAxisPo]);
    mockedListVariants.mockResolvedValue([]);
    mockedListVariantsPage.mockResolvedValue({
      variants: [],
      total: 0,
      nextCursor: undefined,
    });

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Generate Variants' })[0]).toBeEnabled();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Generate Variants' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Generate Variant Matrix')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/The following variant axes have no values selected: Size/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Configure offered values in Options & Attributes before generating combinations/i,
      ),
    ).toBeInTheDocument();

    const generateBtn = screen.getByRole('button', { name: /Generate 0 Variants/i });
    expect(generateBtn).toBeDisabled();
  });

  it('renders view-only mode for archived product', async () => {
    const archivedProduct: Product = {
      ...sampleProduct,
      status: 'archived',
    };

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={archivedProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('TEE-S')[0]).toBeInTheDocument();
    });

    // Subtitle shows archived note
    expect(
      screen.getByText('This product is archived. Variants are displayed in read-only mode.'),
    ).toBeInTheDocument();

    // Create / Generate buttons are not rendered
    expect(screen.queryByRole('button', { name: 'Generate Variants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Variant' })).not.toBeInTheDocument();

    // Row action buttons for Edit / Delete are not rendered
    expect(screen.queryByRole('button', { name: 'Edit variant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete variant' })).not.toBeInTheDocument();
  });

  it('renders view-only mode for pending review product', async () => {
    const pendingProduct: Product = {
      ...sampleProduct,
      status: 'pending',
    };

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={pendingProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('TEE-S')[0]).toBeInTheDocument();
      expect(screen.getByText('Pending Review')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'This product is awaiting review. Variants are displayed in read-only mode.',
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Generate Variants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Variant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit variant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete variant' })).not.toBeInTheDocument();
  });

  it('validates SKU code maximum length of 64 characters and blocks save when exceeding', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    });

    // 65 chars SKU
    fireEvent.change(screen.getByDisplayValue('TEE-S'), {
      target: { value: 'A'.repeat(65) },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(screen.getByText('SKU code cannot exceed 64 characters.')).toBeInTheDocument();
    });

    expect(mockedUpdateVariant).not.toHaveBeenCalled();
  });

  it('validates weight ceiling of 10,000,000 grams and blocks saving greater values', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    });

    // 10,000,001 g
    fireEvent.change(screen.getByDisplayValue('180'), {
      target: { value: '10000001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(screen.getByText('Weight cannot exceed 10,000,000 grams.')).toBeInTheDocument();
    });

    expect(mockedUpdateVariant).not.toHaveBeenCalled();
  });

  it('validates dimension ceiling of 100,000 mm and blocks saving greater values', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    });

    // 100,001 mm length
    fireEvent.change(screen.getByDisplayValue('250'), {
      target: { value: '100001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(
        screen.getByText('Dimensions cannot exceed 100,000 mm (100 meters).'),
      ).toBeInTheDocument();
    });

    expect(mockedUpdateVariant).not.toHaveBeenCalled();
  });

  it('displays conflict error banner on OCC conflict 409', async () => {
    mockedUpdateVariant.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Edit variant' })[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit variant' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Variant' }));

    await waitFor(() => {
      expect(
        screen.getByText('That action conflicts with the current state — reload and try again.'),
      ).toBeInTheDocument();
    });
  });

  it('blocks bulk generation in GeneratorModal when SKU prefix would cause SKU length to exceed 64 chars', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Variants' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Variants' }));

    await waitFor(() => {
      expect(screen.getByText('Generate Variant Matrix')).toBeInTheDocument();
    });

    // Enter a very long prefix (65 chars + suffix)
    const prefixInput = screen.getByPlaceholderText('e.g. PROD-100-');
    fireEvent.change(prefixInput, {
      target: { value: 'PREFIX-'.repeat(10) },
    });

    fireEvent.click(screen.getByRole('button', { name: /Generate 1 Variant/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/SKU prefix is too long: combined SKU would exceed 64 characters/i),
      ).toBeInTheDocument();
    });

    expect(mockedCreateVariant).not.toHaveBeenCalled();
  });

  it('filters combinations checklist via search box in GeneratorModal', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Variants' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Variants' }));

    await waitFor(() => {
      expect(screen.getByText('Generate Variant Matrix')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search combinations…');
    fireEvent.change(searchInput, {
      target: { value: 'NonExistentCombo' },
    });

    await waitFor(() => {
      expect(screen.getByText('No combinations match your search.')).toBeInTheDocument();
    });
  });

  it('displays showing count and loads more variants on click', async () => {
    mockedListVariantsPage
      .mockResolvedValueOnce({
        variants: [sampleVariant],
        total: 2,
        nextCursor: 'cursor_page_2',
      })
      .mockResolvedValueOnce({
        variants: [
          {
            ...sampleVariant,
            id: 'var_page_2',
            skuCode: 'TEE-M',
          },
        ],
        total: 2,
        nextCursor: undefined,
      });

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 2 variants')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Load more variants' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Load more variants' }));

    await waitFor(() => {
      expect(screen.getByText('Showing 2 of 2 variants')).toBeInTheDocument();
      expect(screen.getAllByText('TEE-M')[0]).toBeInTheDocument();
    });
  });

  it('renders card view with right-aligned metrics (GTIN, weight, dimensions) under status badge', async () => {
    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('TEE-S')[0]).toBeInTheDocument();
    });

    const card = document.querySelector('.lg\\:hidden .rounded-lg');
    expect(card).toBeInTheDocument();
    const rightCol = card?.querySelector('.text-right');
    expect(rightCol).toBeInTheDocument();
    expect(rightCol?.textContent).toContain('123456789012');
    expect(rightCol?.textContent).toContain('180g');
  });

  it('enables Generate Variants and Add Variant buttons when a combination is deleted from a fully-generated matrix', async () => {
    // 2 variants existing out of 2 max combinations
    const variant1: Variant = {
      ...sampleVariant,
      id: 'var-1',
      skuCode: 'TEE-S',
      comboSignature: 'color:black',
    };
    const variant2: Variant = {
      ...sampleVariant,
      id: 'var-2',
      skuCode: 'TEE-M',
      comboSignature: 'color:white',
    };

    mockedListVariantsPage.mockResolvedValueOnce({
      variants: [variant1, variant2],
      total: 2,
      nextCursor: undefined,
    });
    mockedListProductOptions.mockResolvedValueOnce([
      {
        productId: sampleProduct.id,
        optionTypeId: 'ot-1',
        optionTypeCode: 'color',
        requiredValueId: null,
        position: 0,
        values: [
          {
            optionValueId: 'ov-1',
            code: 'black',
            position: 0,
          },
          {
            optionValueId: 'ov-2',
            code: 'white',
            position: 1,
          },
        ],
      },
    ]);
    mockedListCategoryOptions.mockResolvedValueOnce([
      {
        categoryId: sampleProduct.categoryId,
        optionTypeId: 'ot-1',
        optionTypeCode: 'color',
        applicability: 'required',
        isVariantAxis: true,
        valueSource: 'open',
        valueSetId: null,
        priceImpact: false,
        position: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    // Initial state: all 2 combinations generated -> buttons disabled, banner visible
    await waitFor(() => {
      expect(
        screen.getByText('All possible variant combinations have already been generated.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate Variants' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add Variant' })).toBeDisabled();
    });

    // Mock delete of variant 1
    mockedDeleteVariant.mockResolvedValueOnce(undefined);
    mockedListVariantsPage.mockResolvedValueOnce({
      variants: [variant2],
      total: 1,
      nextCursor: undefined,
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete variant' });
    fireEvent.click(deleteButtons[0]!);

    // After deleting 1 variant: 1 of 2 combinations remain -> buttons get enabled, banner disappears!
    await waitFor(() => {
      expect(
        screen.queryByText('All possible variant combinations have already been generated.'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate Variants' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add Variant' })).not.toBeDisabled();
    });
  });

  it('falls back to treating product options as variant axes when categoryOptions has no mappings', async () => {
    // Category has NO category options configured ([]), but product has 2 options with 2 values each (max 4 combos)
    mockedListVariantsPage.mockResolvedValueOnce({
      variants: [sampleVariant],
      total: 1,
      nextCursor: undefined,
    });
    mockedListProductOptions.mockResolvedValueOnce([
      {
        productId: sampleProduct.id,
        optionTypeId: 'ot-1',
        optionTypeCode: 'color',
        requiredValueId: null,
        position: 0,
        values: [
          {
            optionValueId: 'ov-1',
            code: 'black',
            position: 0,
          },
          {
            optionValueId: 'ov-2',
            code: 'white',
            position: 1,
          },
        ],
      },
    ]);
    mockedListCategoryOptions.mockResolvedValueOnce([]); // empty category options!

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    // With total=1 and maxCombos=2 (from fallback), buttons must NOT be disabled as allCombosGenerated is false
    await waitFor(() => {
      expect(
        screen.queryByText('All possible variant combinations have already been generated.'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate Variants' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add Variant' })).not.toBeDisabled();
    });
  });
});
