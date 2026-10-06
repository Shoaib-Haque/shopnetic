import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Category, CategoryOption, OptionType, ValueSet } from '@shopnetic/contracts';
import { AdminTestProviders, renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { deleteCategoryOption, listCategoryOptions, putCategoryOption } from './api';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { listValueSets } from '@/features/catalog/value-sets/api';
import { CategoryOptionsDialog } from './category-options-dialog';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listCategoryOptions: vi.fn(),
    putCategoryOption: vi.fn(),
    deleteCategoryOption: vi.fn(),
  };
});

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

vi.mock('@/features/catalog/value-sets/api', () => ({
  listValueSets: vi.fn(),
}));

const mockedListCategoryOptions = vi.mocked(listCategoryOptions);
const mockedPutCategoryOption = vi.mocked(putCategoryOption);
const mockedDeleteCategoryOption = vi.mocked(deleteCategoryOption);
const mockedListOptionTypesPage = vi.mocked(listOptionTypesPage);
const mockedListValueSets = vi.mocked(listValueSets);

const sampleCategory: Category = {
  id: 'cat_1',
  slug: 'clothing',
  name: { en: 'Clothing' },
  parentId: null,
  path: 'cat_1',
  depth: 0,
  position: 0,
  isActive: true,
  brandRequirement: 'optional',
  archivedAt: null,
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
  values: [],
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
  values: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sizeValueSet: ValueSet = {
  id: 'vs_sizes',
  name: 'Standard Sizes',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  items: [
    {
      optionValueId: 'ov_s',
      optionTypeId: 'ot_size',
      code: 's',
      label: { en: 'Small' },
      position: 0,
    },
  ],
};

const mappedSizeOption: CategoryOption = {
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
};

beforeEach(() => {
  mockedListOptionTypesPage.mockResolvedValue({
    optionTypes: [sizeOptionType, colorOptionType],
    nextCursor: undefined,
  });
  mockedListValueSets.mockResolvedValue([sizeValueSet]);
  mockedListCategoryOptions.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('CategoryOptionsDialog', () => {
  it('renders empty state when no options are mapped', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    expect(
      await screen.findByText('No option types mapped to this category yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Options & attributes — “Clothing”')).toBeInTheDocument();
  });

  it('renders existing mapped options with desktop table and mobile card views', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([mappedSizeOption]);

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    expect((await screen.findAllByText('Size')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('/size').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Variant axis').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);

    // Desktop table container exists with hidden md:block
    const desktopTable = document.body.querySelector('.hidden.md\\:block');
    expect(desktopTable).toBeInTheDocument();
    expect(desktopTable?.querySelector('[data-category-option-row="ot_size"]')).toBeInTheDocument();

    // Mobile list container exists with md:hidden
    const mobileList = document.body.querySelector('ul.md\\:hidden');
    expect(mobileList).toBeInTheDocument();
    expect(mobileList?.querySelector('[data-category-option-card="ot_size"]')).toBeInTheDocument();
  });

  it('truncates long category names in the dialog header with an ellipsis', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);

    const longCategory: Category = {
      ...sampleCategory,
      id: 'cat_long',
      slug: 'super-long-headphones-category-slug',
      name: {
        en: 'Headphones with Extra Bass Noise Cancelling Wireless Bluetooth 5.3 Over-Ear Studio Monitor Grade Special Edition',
      },
    };

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={longCategory} />);

    const titleEl = await screen.findByRole('heading', { level: 2 });
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveClass('truncate');
    expect(titleEl).toHaveAttribute(
      'title',
      'Options & attributes — “Headphones with Extra Bass Noise Cancelling Wireless Bluetooth 5.3 Over-Ear Studio Monitor Grade Special Edition”',
    );
  });

  it('allows adding a new option type mapping', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);
    mockedPutCategoryOption.mockResolvedValueOnce({
      ...mappedSizeOption,
      optionTypeId: 'ot_size',
    });

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    // Click "Map option type"
    const addButtons = await screen.findAllByRole('button', { name: /Map option type/i });
    fireEvent.click(addButtons[0]!);

    expect(await screen.findByText('Map new option type')).toBeInTheDocument();

    // Fill and submit form
    const saveButton = screen.getByRole('button', { name: 'Save mapping' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedPutCategoryOption).toHaveBeenCalledWith(
        'cat_1',
        'ot_size',
        expect.objectContaining({
          applicability: 'optional',
          isVariantAxis: true,
          valueSource: 'open',
          valueSetId: null,
          priceImpact: false,
        }),
      );
    });

    expect(await screen.findByText(/Option type “Size” mapped to category\./i)).toBeInTheDocument();
  });

  it('validates that predefined value source requires selecting a value set', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    const addButtons = await screen.findAllByRole('button', { name: /Map option type/i });
    fireEvent.click(addButtons[0]!);

    await screen.findByText('Map new option type');

    // Change value source to predefined
    const sourceSelect = screen.getByLabelText('Value source');
    fireEvent.change(sourceSelect, { target: { value: 'predefined' } });

    // Try to save without selecting a value set
    const saveButton = screen.getByRole('button', { name: 'Save mapping' });
    fireEvent.click(saveButton);

    expect(
      await screen.findByText('The option configuration is invalid for this value source.'),
    ).toBeInTheDocument();
    expect(mockedPutCategoryOption).not.toHaveBeenCalled();

    // Now select a valid value set and submit
    const vsSelect = screen.getByLabelText('Value set');
    fireEvent.change(vsSelect, { target: { value: 'vs_sizes' } });

    mockedPutCategoryOption.mockResolvedValueOnce({
      ...mappedSizeOption,
      valueSource: 'predefined',
      valueSetId: 'vs_sizes',
    });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedPutCategoryOption).toHaveBeenCalledWith(
        'cat_1',
        'ot_size',
        expect.objectContaining({
          valueSource: 'predefined',
          valueSetId: 'vs_sizes',
        }),
      );
    });
  });

  it('allows editing an existing option mapping', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([mappedSizeOption]);
    mockedPutCategoryOption.mockResolvedValueOnce({
      ...mappedSizeOption,
      applicability: 'optional',
      priceImpact: true,
    });

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    await screen.findAllByText('Size');

    // Click edit button
    const editButton = screen.getAllByTitle('Edit configuration')[0]!;
    fireEvent.click(editButton);

    expect(await screen.findByText('Edit mapping: Size')).toBeInTheDocument();

    // Change applicability to optional
    const appSelect = screen.getByLabelText('Applicability');
    fireEvent.change(appSelect, { target: { value: 'optional' } });

    // Save
    const saveButton = screen.getByRole('button', { name: 'Save mapping' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedPutCategoryOption).toHaveBeenCalledWith(
        'cat_1',
        'ot_size',
        expect.objectContaining({
          applicability: 'optional',
        }),
      );
    });
  });

  it('allows removing an option mapping with one-click undo', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([mappedSizeOption]);
    mockedDeleteCategoryOption.mockResolvedValueOnce(undefined);
    mockedPutCategoryOption.mockResolvedValueOnce(mappedSizeOption);

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    await screen.findAllByText('Size');

    const removeButton = screen.getAllByTitle('Remove from category')[0]!;
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockedDeleteCategoryOption).toHaveBeenCalledWith('cat_1', 'ot_size');
    });

    expect(
      await screen.findByText(/Option type “Size” removed from category\./i),
    ).toBeInTheDocument();

    // Click "Undo" button in the toast
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undoButton);

    await waitFor(() => {
      expect(mockedPutCategoryOption).toHaveBeenCalledWith(
        'cat_1',
        'ot_size',
        expect.objectContaining({
          applicability: 'required',
          isVariantAxis: true,
          valueSource: 'open',
          valueSetId: null,
          priceImpact: false,
        }),
      );
    });

    expect(
      await screen.findByText(/Option type “Size” restored to category\./i),
    ).toBeInTheDocument();
  });

  it('displays API error alert when save fails', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);
    mockedPutCategoryOption.mockRejectedValueOnce(
      new AdminApiError('VALUE_SET_TYPE_MISMATCH', 422),
    );

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    const addButtons = await screen.findAllByRole('button', { name: /Map option type/i });
    fireEvent.click(addButtons[0]!);

    await screen.findByText('Map new option type');

    const saveButton = screen.getByRole('button', { name: 'Save mapping' });
    fireEvent.click(saveButton);

    expect(
      await screen.findByText('The selected value set contains values of another option type.'),
    ).toBeInTheDocument();
  });

  it('cleans state immediately when switching categories without flashing stale options', async () => {
    mockedListCategoryOptions.mockImplementation(async (catId) => {
      if (catId === 'cat_1') return [mappedSizeOption];
      return [];
    });

    const otherCategory: Category = {
      ...sampleCategory,
      id: 'cat_2',
      slug: 'headphones',
      name: { en: 'Headphones' },
    };

    const { rerender } = renderAdmin(
      <CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />,
    );

    expect((await screen.findAllByText('Size')).length).toBeGreaterThan(0);

    // Switch category to Headphones (cat_2)
    rerender(
      <AdminTestProviders>
        <CategoryOptionsDialog open onOpenChange={vi.fn()} category={otherCategory} />
      </AdminTestProviders>,
    );

    // Old options from Clothing (cat_1) must be wiped immediately — not visible during cat_2 loading
    expect(screen.queryAllByText('Size')).toHaveLength(0);

    // Once cat_2 finishes loading, shows empty state under cat_2 title
    expect(
      await screen.findByText('No option types mapped to this category yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Options & attributes — “Headphones”')).toBeInTheDocument();
  });

  it('renders archived category in read-only mode with badge and no edit/remove buttons', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([mappedSizeOption]);

    const archivedCategory: Category = {
      ...sampleCategory,
      archivedAt: '2026-01-01T00:00:00.000Z',
    };

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={archivedCategory} />);

    expect((await screen.findAllByText('Size')).length).toBeGreaterThan(0);
    expect(screen.getByText('Archived — view only')).toBeInTheDocument();

    // "Map option type" button must NOT be present
    expect(screen.queryByRole('button', { name: /Map option type/i })).not.toBeInTheDocument();

    // Edit and Remove action buttons must NOT be present in table
    expect(screen.queryByRole('button', { name: 'Edit configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from category' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('renders archived empty state when archived category has no mappings', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([]);

    const archivedCategory: Category = {
      ...sampleCategory,
      archivedAt: '2026-01-01T00:00:00.000Z',
    };

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={archivedCategory} />);

    expect(
      await screen.findByText('No option types are mapped to this archived category.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Archived — view only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Map option type/i })).not.toBeInTheDocument();
  });

  it('closes inline edit mode without calling API when saved with no changes (pristine edit)', async () => {
    mockedListCategoryOptions.mockResolvedValueOnce([mappedSizeOption]);

    renderAdmin(<CategoryOptionsDialog open onOpenChange={vi.fn()} category={sampleCategory} />);

    expect((await screen.findAllByText('Size')).length).toBeGreaterThan(0);

    // Click edit configuration button
    const editBtn = screen.getAllByRole('button', { name: 'Edit configuration' })[0]!;
    fireEvent.click(editBtn);

    // Inline form should be open with "Edit mapping: Size"
    expect(screen.getByText('Edit mapping: Size')).toBeInTheDocument();

    // Click "Save mapping" without changing anything
    const saveBtn = screen.getByRole('button', { name: 'Save mapping' });
    fireEvent.click(saveBtn);

    // Inline form must close
    await waitFor(() => {
      expect(screen.queryByText('Edit mapping: Size')).not.toBeInTheDocument();
    });

    // putCategoryOption must NOT have been called
    expect(mockedPutCategoryOption).not.toHaveBeenCalled();
  });
});
