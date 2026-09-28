import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OptionType } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import {
  addOptionValue,
  createOptionType,
  removeOptionValue,
  updateOptionType,
  updateOptionValue,
} from './api';
import { OptionTypeFormModal } from './option-type-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createOptionType: vi.fn(),
    updateOptionType: vi.fn(),
    addOptionValue: vi.fn(),
    updateOptionValue: vi.fn(),
    removeOptionValue: vi.fn(),
  };
});

const mockedCreateOptionType = vi.mocked(createOptionType);
const mockedUpdateOptionType = vi.mocked(updateOptionType);
const mockedAddOptionValue = vi.mocked(addOptionValue);
const mockedUpdateOptionValue = vi.mocked(updateOptionValue);
const mockedRemoveOptionValue = vi.mocked(removeOptionValue);

function optionType(id: string, code: string, overrides: Partial<OptionType> = {}): OptionType {
  return {
    id,
    code,
    name: { en: code },
    dataType: 'select',
    hasSwatch: false,
    status: 'active',
    archived: false,
    values: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedCreateOptionType.mockReset();
  mockedUpdateOptionType.mockReset();
  mockedAddOptionValue.mockReset();
  mockedUpdateOptionValue.mockReset();
  mockedRemoveOptionValue.mockReset();
});

describe('OptionTypeFormModal — create', () => {
  it('submits code/name/dataType/hasSwatch as entered', async () => {
    mockedCreateOptionType.mockResolvedValueOnce(optionType('ot1', 'color'));
    const onSaved = vi.fn();

    renderAdmin(
      <OptionTypeFormModal open onOpenChange={vi.fn()} mode="create" onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'Color' } });
    fireEvent.blur(screen.getByLabelText('Code'));
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Color' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedCreateOptionType).toHaveBeenCalledTimes(1));
    expect(mockedCreateOptionType).toHaveBeenCalledWith({
      code: 'color',
      name: { en: 'Color' },
      dataType: 'select',
      hasSwatch: false,
    });
    expect(onSaved).toHaveBeenCalledWith('created', optionType('ot1', 'color'));
  });

  it('a server-side taken-code error is set on the code field, not a generic form error', async () => {
    mockedCreateOptionType.mockRejectedValueOnce(new AdminApiError('OPTION_TYPE_CODE_TAKEN', 409));

    renderAdmin(
      <OptionTypeFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'color' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Color' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That code is already in use by another option type.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a draft value is added locally and included in the create request', async () => {
    mockedCreateOptionType.mockResolvedValueOnce(optionType('ot1', 'color'));

    renderAdmin(
      <OptionTypeFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'color' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Color' } });
    fireEvent.change(screen.getByPlaceholderText('Code'), { target: { value: 'red' } });
    fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Red')).toBeInTheDocument();
    expect(mockedAddOptionValue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedCreateOptionType).toHaveBeenCalledTimes(1));
    expect(mockedCreateOptionType).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [{ code: 'red', label: { en: 'Red' } }],
      }),
    );
  });

  it('reorders draft values with the move up/down buttons before create — a plain local swap, no API call', async () => {
    mockedCreateOptionType.mockResolvedValueOnce(optionType('ot1', 'color'));

    renderAdmin(
      <OptionTypeFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'color' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Color' } });

    fireEvent.change(screen.getByPlaceholderText('Code'), { target: { value: 'red' } });
    fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Red');

    fireEvent.change(screen.getByPlaceholderText('Code'), { target: { value: 'blue' } });
    fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Blue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Blue');

    // Red, then Blue — move Blue (2nd row) up, swapping the two
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedCreateOptionType).toHaveBeenCalledTimes(1));
    expect(mockedCreateOptionType).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [
          { code: 'blue', label: { en: 'Blue' } },
          { code: 'red', label: { en: 'Red' } },
        ],
      }),
    );
  });
});

describe('OptionTypeFormModal — edit', () => {
  it('a no-op save (nothing changed) closes without calling updateOptionType', async () => {
    const onOpenChange = vi.fn();
    const ot = optionType('ot1', 'color');

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={onOpenChange}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue('color'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockedUpdateOptionType).not.toHaveBeenCalled();
  });

  it('sends only the changed field(s), plus expectedUpdatedAt — not the whole form', async () => {
    const ot = optionType('ot1', 'color', { updatedAt: '2026-02-01T00:00:00.000Z' });
    mockedUpdateOptionType.mockResolvedValueOnce({ ...ot, name: { en: 'Colour' } });

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue('color'));
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Colour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedUpdateOptionType).toHaveBeenCalledTimes(1));
    expect(mockedUpdateOptionType).toHaveBeenCalledWith('ot1', {
      name: { en: 'Colour' },
      expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('a CONFLICT calls onConflict instead of showing a form error', async () => {
    const onConflict = vi.fn();
    const ot = optionType('ot1', 'color');
    mockedUpdateOptionType.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
        onConflict={onConflict}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue('color'));
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Colour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('removes a value on success and tells the list about it', async () => {
    const onValuesChanged = vi.fn();
    const ot = optionType('ot1', 'color', {
      values: [
        {
          id: 'v1',
          optionTypeId: 'ot1',
          code: 'red',
          label: { en: 'Red' },
          swatchHex: null,
          swatchImageKey: null,
          position: 0,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mockedRemoveOptionValue.mockResolvedValueOnce(undefined);

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
        onValuesChanged={onValuesChanged}
      />,
    );

    await screen.findByText('Red');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('Red')).not.toBeInTheDocument());
    expect(mockedRemoveOptionValue).toHaveBeenCalledWith('ot1', 'v1');
    expect(onValuesChanged).toHaveBeenCalledWith(expect.objectContaining({ values: [] }));
  });

  it("toggles a value's status between active and deprecated", async () => {
    const onValuesChanged = vi.fn();
    const value = {
      id: 'v1',
      optionTypeId: 'ot1',
      code: 'red',
      label: { en: 'Red' },
      swatchHex: null,
      swatchImageKey: null,
      position: 0,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const ot = optionType('ot1', 'color', { values: [value] });
    mockedUpdateOptionValue.mockResolvedValueOnce({
      ...ot,
      values: [{ ...value, status: 'deprecated' }],
    });

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
        onValuesChanged={onValuesChanged}
      />,
    );

    await screen.findByText('Red');
    // scoped to a button role — the type's own Status <select> also renders
    // "Active"/"Deprecated" option text in the DOM, which a plain
    // `getByText` would ambiguously match too.
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));

    await waitFor(() =>
      expect(mockedUpdateOptionValue).toHaveBeenCalledWith('ot1', 'v1', { status: 'deprecated' }),
    );
    expect(await screen.findByRole('button', { name: 'Deprecated' })).toBeInTheDocument();
  });

  it("reorders values with the move up/down buttons — writes each value's swapped position", async () => {
    const onValuesChanged = vi.fn();
    const red = {
      id: 'v1',
      optionTypeId: 'ot1',
      code: 'red',
      label: { en: 'Red' },
      swatchHex: null,
      swatchImageKey: null,
      position: 0,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const blue = { ...red, id: 'v2', code: 'blue', label: { en: 'Blue' }, position: 1 };
    const ot = optionType('ot1', 'color', { values: [red, blue] });

    mockedUpdateOptionValue
      // the first call's own snapshot reflects only one side of the swap —
      // never applied to state, only the second (final) response is
      .mockResolvedValueOnce({ ...ot, values: [{ ...red, position: 1 }, blue] })
      .mockResolvedValueOnce({
        ...ot,
        values: [
          { ...blue, position: 0 },
          { ...red, position: 1 },
        ],
      });

    renderAdmin(
      <OptionTypeFormModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        optionType={ot}
        onSaved={vi.fn()}
        onValuesChanged={onValuesChanged}
      />,
    );

    await screen.findByText('Red');
    // Red, then Blue — move Blue (2nd row) up
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);

    await waitFor(() => expect(mockedUpdateOptionValue).toHaveBeenCalledTimes(2));
    expect(mockedUpdateOptionValue).toHaveBeenNthCalledWith(1, 'ot1', 'v2', { position: 0 });
    expect(mockedUpdateOptionValue).toHaveBeenNthCalledWith(2, 'ot1', 'v1', { position: 1 });
    expect(onValuesChanged).toHaveBeenCalledTimes(1);
  });
});
