import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  CategoryOption,
  OptionType,
  Product,
  ProductOption,
  Variant,
} from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listCategoryOptions } from '@/features/catalog/categories/api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import {
  createVariant,
  deleteVariant,
  listProductOptions,
  listVariants,
  restoreVariant,
  updateVariant,
} from './api';
import { ProductVariantsDialog } from './product-variants-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listVariants: vi.fn(),
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
  description: { en: 'Comfortable tee' },
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
      expect(screen.getByText('Size: Small')).toBeInTheDocument();
      expect(screen.getByText('TEE-S')).toBeInTheDocument();
      expect(screen.getByText('123456789012')).toBeInTheDocument();
      expect(screen.getByText('180g')).toBeInTheDocument();
      expect(screen.getByText('250×200×15 mm')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Edit variant' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit variant' }));

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
      expect(screen.getByText('TEE-S-UPDATED')).toBeInTheDocument();
    });
  });

  it('deletes a variant', async () => {
    mockedDeleteVariant.mockResolvedValue(undefined);
    mockedListVariants.mockResolvedValueOnce([sampleVariant]).mockResolvedValue([]);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete variant' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete variant' }));

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

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Material: Cotton')).toBeInTheDocument();
    });
    expect(screen.queryByText(/01a0b3eb-6700/)).not.toBeInTheDocument();
  });

  it('soft-deleting a variant displays an undo toast, and clicking Undo restores it', async () => {
    mockedListVariants
      .mockResolvedValueOnce([sampleVariant]) // mount
      .mockResolvedValueOnce([]) // after delete
      .mockResolvedValueOnce([sampleVariant]); // after undo/restore
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
      expect(screen.getByText('TEE-S')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: 'Delete variant' });
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
});
