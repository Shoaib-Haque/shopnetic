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
      });
      expect(screen.getByText('TEE-S-UPDATED')).toBeInTheDocument();
    });
  });

  it('deletes a variant', async () => {
    mockedDeleteVariant.mockResolvedValue(undefined);

    renderAdmin(
      <ProductVariantsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete variant' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete variant' }));

    await waitFor(() => {
      expect(mockedDeleteVariant).toHaveBeenCalledWith('prod_1', 'var_1');
      expect(screen.queryByText('TEE-S')).not.toBeInTheDocument();
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
});
