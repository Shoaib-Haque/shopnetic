import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { CategoryOption, OptionType, Product, ProductOption } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { listCategoryOptions } from '@/features/catalog/categories/api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { listValueSets } from '@/features/catalog/value-sets/api';
import {
  deleteProductOption,
  listProductOptions,
  putProductOption,
  setProductOptionValues,
} from './api';
import { ProductOptionsDialog } from './product-options-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listProductOptions: vi.fn(),
    putProductOption: vi.fn(),
    setProductOptionValues: vi.fn(),
    deleteProductOption: vi.fn(),
  };
});

vi.mock('@/features/catalog/categories/api', () => ({
  listCategoryOptions: vi.fn(),
}));

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

vi.mock('@/features/catalog/value-sets/api', () => ({
  listValueSets: vi.fn(),
}));

const mockedListProductOptions = vi.mocked(listProductOptions);
const mockedPutProductOption = vi.mocked(putProductOption);
const mockedSetProductOptionValues = vi.mocked(setProductOptionValues);
const mockedDeleteProductOption = vi.mocked(deleteProductOption);
const mockedListCategoryOptions = vi.mocked(listCategoryOptions);
const mockedListOptionTypesPage = vi.mocked(listOptionTypesPage);
const mockedListValueSets = vi.mocked(listValueSets);

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
  dataType: 'swatch',
  hasSwatch: true,
  status: 'active',
  archived: false,
  values: [
    {
      id: 'val_blk',
      optionTypeId: 'ot_color',
      code: 'blk',
      label: { en: 'Black' },
      swatchHex: '#000000',
      swatchImageKey: null,
      position: 0,
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
  {
    categoryId: 'cat_1',
    optionTypeId: 'ot_color',
    optionTypeCode: 'color',
    applicability: 'optional',
    isVariantAxis: true,
    valueSource: 'open',
    valueSetId: null,
    priceImpact: false,
    position: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleProductOption: ProductOption = {
  productId: 'prod_1',
  optionTypeId: 'ot_size',
  optionTypeCode: 'size',
  position: 0,
  requiredValueId: null,
  values: [
    { optionValueId: 'val_s', code: 's', position: 0 },
    { optionValueId: 'val_m', code: 'm', position: 1 },
  ],
};

describe('ProductOptionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListProductOptions.mockResolvedValue([sampleProductOption]);
    mockedListCategoryOptions.mockResolvedValue(categoryOptions);
    mockedListOptionTypesPage.mockResolvedValue({
      optionTypes: [sizeOptionType, colorOptionType],
      nextCursor: undefined,
    });
    mockedListValueSets.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders configured product options and labels correctly', async () => {
    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Product Options & Attributes')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('/size')).toBeInTheDocument();
    });

    expect(screen.getByText('Variant Axis')).toBeInTheDocument();
    expect(screen.getByText('Required by Category')).toBeInTheDocument();
    expect(screen.getByText('Select Values (2)')).toBeInTheDocument();
  });

  it('adds an available category option to the product', async () => {
    mockedPutProductOption.mockResolvedValue({
      productId: 'prod_1',
      optionTypeId: 'ot_color',
      optionTypeCode: 'color',
      position: 1,
      requiredValueId: null,
      values: [],
    });

    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Select an option axis…' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Select an option axis…' }), {
      target: { value: 'ot_color' },
    });

    const addBtn = screen.getByRole('button', { name: 'Add Option Axis' });
    expect(addBtn).toBeEnabled();
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockedPutProductOption).toHaveBeenCalledWith('prod_1', 'ot_color', { position: 1 });
      expect(screen.getByText('Color')).toBeInTheDocument();
    });
  });

  it('opens value select modal and saves selected values', async () => {
    mockedSetProductOptionValues.mockResolvedValue({
      ...sampleProductOption,
      values: [{ optionValueId: 'val_s', code: 's', position: 0 }],
    });

    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Select Values (2)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Select Values (2)'));

    await waitFor(() => {
      expect(screen.getByText('Select Offered Values')).toBeInTheDocument();
      expect(screen.getByText('Small')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    // Deselect Medium
    fireEvent.click(screen.getByRole('checkbox', { name: 'Medium' }));

    // Click Save Values
    fireEvent.click(screen.getByRole('button', { name: 'Save Values' }));

    await waitFor(() => {
      expect(mockedSetProductOptionValues).toHaveBeenCalledWith('prod_1', 'ot_size', {
        values: [{ optionValueId: 'val_s', position: 0 }],
      });
    });
  });

  it('updates requiredValueId when single value is selected', async () => {
    mockedPutProductOption.mockResolvedValue({
      ...sampleProductOption,
      requiredValueId: 'val_s',
    });

    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: 'Single Value (Skip Picker)' }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Single Value (Skip Picker)' }), {
      target: { value: 'val_s' },
    });

    await waitFor(() => {
      expect(mockedPutProductOption).toHaveBeenCalledWith('prod_1', 'ot_size', {
        requiredValueId: 'val_s',
      });
    });
  });

  it('removes option from product', async () => {
    mockedDeleteProductOption.mockResolvedValue(undefined);

    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove option' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove option' }));

    await waitFor(() => {
      expect(mockedDeleteProductOption).toHaveBeenCalledWith('prod_1', 'ot_size');
      expect(screen.queryByText('/size')).not.toBeInTheDocument();
    });
  });

  it('shows friendly in-use conflict error when variants use the option', async () => {
    mockedDeleteProductOption.mockRejectedValue(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <ProductOptionsDialog open={true} onOpenChange={vi.fn()} product={sampleProduct} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove option' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove option' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Cannot remove this option because existing variants are currently using it. Delete those variants first.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('calls onManageVariants when Proceed to Variants button is clicked', async () => {
    const onManageVariants = vi.fn();
    const onOpenChange = vi.fn();

    renderAdmin(
      <ProductOptionsDialog
        open={true}
        onOpenChange={onOpenChange}
        product={sampleProduct}
        onManageVariants={onManageVariants}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Manage Variants →' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Manage Variants →' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onManageVariants).toHaveBeenCalledWith(sampleProduct);
  });
});
