import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OptionType, ValueSet } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import {
  addValueSetItem,
  createValueSet,
  getValueSet,
  removeValueSetItem,
  reorderValueSetItems,
  updateValueSet,
} from './api';
import { ValueSetFormModal } from './value-set-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createValueSet: vi.fn(),
    updateValueSet: vi.fn(),
    getValueSet: vi.fn(),
    addValueSetItem: vi.fn(),
    removeValueSetItem: vi.fn(),
    reorderValueSetItems: vi.fn(),
  };
});

const mockedCreateValueSet = vi.mocked(createValueSet);
const mockedUpdateValueSet = vi.mocked(updateValueSet);
const mockedGetValueSet = vi.mocked(getValueSet);
const mockedAddValueSetItem = vi.mocked(addValueSetItem);
const mockedRemoveValueSetItem = vi.mocked(removeValueSetItem);
const mockedReorderValueSetItems = vi.mocked(reorderValueSetItems);

const mockOptionType: OptionType = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'size',
  name: { en: 'Size' },
  dataType: 'select',
  hasSwatch: false,
  status: 'active',
  archived: false,
  values: [
    {
      id: '22222222-2222-2222-2222-222222222221',
      optionTypeId: '11111111-1111-1111-1111-111111111111',
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
      id: '22222222-2222-2222-2222-222222222222',
      optionTypeId: '11111111-1111-1111-1111-111111111111',
      code: 'm',
      label: { en: 'Medium' },
      swatchHex: null,
      swatchImageKey: null,
      position: 1,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222223',
      optionTypeId: '11111111-1111-1111-1111-111111111111',
      code: 'l',
      label: { en: 'Large' },
      swatchHex: null,
      swatchImageKey: null,
      position: 2,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function sampleValueSet(overrides: Partial<ValueSet> = {}): ValueSet {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Standard sizes',
    optionTypeId: '11111111-1111-1111-1111-111111111111',
    items: [
      {
        optionValueId: '22222222-2222-2222-2222-222222222221',
        optionTypeId: '11111111-1111-1111-1111-111111111111',
        code: 's',
        label: { en: 'Small' },
        position: 0,
      },
      {
        optionValueId: '22222222-2222-2222-2222-222222222222',
        optionTypeId: '11111111-1111-1111-1111-111111111111',
        code: 'm',
        label: { en: 'Medium' },
        position: 1,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedCreateValueSet.mockReset();
  mockedUpdateValueSet.mockReset();
  mockedGetValueSet.mockReset();
  mockedAddValueSetItem.mockReset();
  mockedRemoveValueSetItem.mockReset();
  mockedReorderValueSetItems.mockReset();
});

describe('ValueSetFormModal — create', () => {
  it('submits name, optionTypeId, and draft items as entered', async () => {
    const createdVs = sampleValueSet();
    mockedCreateValueSet.mockResolvedValueOnce(createdVs);
    const onSaved = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        optionTypes={[mockOptionType]}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Standard sizes' },
    });
    fireEvent.change(screen.getByLabelText('Option type'), {
      target: { value: mockOptionType.id },
    });

    // Option values are now available in the picker dropdown
    const valueSelect = screen.getByLabelText('Choose a value to add…');
    fireEvent.change(valueSelect, {
      target: { value: '22222222-2222-2222-2222-222222222221' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));

    expect(screen.getByText('Small')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedCreateValueSet).toHaveBeenCalledTimes(1));
    expect(mockedCreateValueSet).toHaveBeenCalledWith({
      name: 'Standard sizes',
      optionTypeId: mockOptionType.id,
      items: [
        {
          optionValueId: '22222222-2222-2222-2222-222222222221',
          position: 0,
        },
      ],
    });
    expect(onSaved).toHaveBeenCalledWith('created', createdVs);
  });

  it('a server-side name taken error is set on the name field', async () => {
    mockedCreateValueSet.mockRejectedValueOnce(new AdminApiError('VALUE_SET_NAME_TAKEN', 409));

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        optionTypes={[mockOptionType]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Standard sizes' },
    });
    fireEvent.change(screen.getByLabelText('Option type'), {
      target: { value: mockOptionType.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'A value set with that name already exists (names are case-insensitive).',
      ),
    ).toBeInTheDocument();
  });

  it('clears staged values when switching option type during create', async () => {
    const secondOptionType: OptionType = {
      ...mockOptionType,
      id: '99999999-9999-9999-9999-999999999999',
      code: 'color',
      name: { en: 'Color' },
      values: [
        {
          id: '88888888-8888-8888-8888-888888888881',
          optionTypeId: '99999999-9999-9999-9999-999999999999',
          code: 'red',
          label: { en: 'Red' },
          swatchHex: '#ff0000',
          swatchImageKey: null,
          position: 0,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="create"
        optionTypes={[mockOptionType, secondOptionType]}
        onSaved={vi.fn()}
      />,
    );

    // Pick first option type (Size)
    fireEvent.change(screen.getByLabelText('Option type'), {
      target: { value: mockOptionType.id },
    });

    // Add a size value
    const valueSelect = screen.getByLabelText('Choose a value to add…');
    fireEvent.change(valueSelect, {
      target: { value: '22222222-2222-2222-2222-222222222221' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));

    expect(screen.getByText('Small')).toBeInTheDocument();

    // Now switch to Color
    fireEvent.change(screen.getByLabelText('Option type'), {
      target: { value: secondOptionType.id },
    });

    // Staged size item 'Small' should be cleared
    expect(screen.queryByText('Small')).not.toBeInTheDocument();
  });
});

describe('ValueSetFormModal — edit', () => {
  it('submits updated name with expectedUpdatedAt', async () => {
    const existing = sampleValueSet();
    const updated = { ...existing, name: 'Renamed sizes', updatedAt: '2026-01-02T00:00:00.000Z' };
    mockedUpdateValueSet.mockResolvedValueOnce(updated);
    const onSaved = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        valueSet={existing}
        optionTypes={[mockOptionType]}
        onSaved={onSaved}
      />,
    );

    // Option type should be locked
    expect(screen.getByText('Option type is locked after creation.')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Renamed sizes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedUpdateValueSet).toHaveBeenCalledTimes(1));
    expect(mockedUpdateValueSet).toHaveBeenCalledWith(existing.id, {
      name: 'Renamed sizes',
      expectedUpdatedAt: existing.updatedAt,
    });
    expect(onSaved).toHaveBeenCalledWith('updated', updated);
  });

  it('adding an item in edit mode calls addValueSetItem', async () => {
    const existing = sampleValueSet();
    const withLarge = {
      ...existing,
      items: [
        ...existing.items,
        {
          optionValueId: 'val-3333-3333-3333-333333333333',
          optionTypeId: mockOptionType.id,
          code: 'l',
          label: { en: 'Large' },
          position: 2,
        },
      ],
    };
    mockedAddValueSetItem.mockResolvedValueOnce(withLarge);
    const onValuesChanged = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        valueSet={existing}
        optionTypes={[mockOptionType]}
        onValuesChanged={onValuesChanged}
      />,
    );

    const valueSelect = screen.getByRole('combobox');
    fireEvent.change(valueSelect, {
      target: { value: '22222222-2222-2222-2222-222222222223' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));

    await waitFor(() => expect(mockedAddValueSetItem).toHaveBeenCalledTimes(1));
    expect(mockedAddValueSetItem).toHaveBeenCalledWith(existing.id, {
      optionValueId: '22222222-2222-2222-2222-222222222223',
      position: 2,
    });
    expect(onValuesChanged).toHaveBeenCalledWith(withLarge);
  });

  it('removing an item in edit mode calls removeValueSetItem and refreshes', async () => {
    const existing = sampleValueSet();
    const afterRemove = {
      ...existing,
      items: [existing.items[1]!],
    };
    mockedRemoveValueSetItem.mockResolvedValueOnce();
    mockedGetValueSet.mockResolvedValueOnce(afterRemove);
    const onValuesChanged = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        valueSet={existing}
        optionTypes={[mockOptionType]}
        onValuesChanged={onValuesChanged}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]!);

    await waitFor(() => expect(mockedRemoveValueSetItem).toHaveBeenCalledTimes(1));
    expect(mockedRemoveValueSetItem).toHaveBeenCalledWith(
      existing.id,
      '22222222-2222-2222-2222-222222222221',
    );
    expect(mockedGetValueSet).toHaveBeenCalledWith(existing.id);
    expect(onValuesChanged).toHaveBeenCalledWith(afterRemove);
  });

  it('reordering an item calls reorderValueSetItems', async () => {
    const existing = sampleValueSet();
    const afterReorder = {
      ...existing,
      items: [
        { ...existing.items[1]!, position: 0 },
        { ...existing.items[0]!, position: 1 },
      ],
    };
    mockedReorderValueSetItems.mockResolvedValueOnce(afterReorder);
    const onValuesChanged = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        valueSet={existing}
        optionTypes={[mockOptionType]}
        onValuesChanged={onValuesChanged}
      />,
    );

    const moveDownButtons = screen.getAllByRole('button', { name: 'Move down' });
    fireEvent.click(moveDownButtons[0]!);

    await waitFor(() => expect(mockedReorderValueSetItems).toHaveBeenCalledTimes(1));
    expect(mockedReorderValueSetItems).toHaveBeenCalledWith(existing.id, {
      orderedOptionValueIds: [
        '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222221',
      ],
    });
    expect(onValuesChanged).toHaveBeenCalledWith(afterReorder);
  });

  it('triggers onConflict on CONFLICT save error', async () => {
    const existing = sampleValueSet();
    mockedUpdateValueSet.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));
    const onConflict = vi.fn();

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        valueSet={existing}
        optionTypes={[mockOptionType]}
        onConflict={onConflict}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
  });
});

describe('ValueSetFormModal — view', () => {
  it('renders read-only view with no add/remove buttons and disabled inputs', () => {
    const existing = sampleValueSet({ deletedAt: '2026-01-02T00:00:00.000Z' });

    renderAdmin(
      <ValueSetFormModal
        open
        onOpenChange={vi.fn()}
        mode="view"
        valueSet={existing}
        optionTypes={[mockOptionType]}
      />,
    );

    expect(screen.getByText('Value set (archived)')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add value' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
