import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OptionType, ValueSet } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { listOptionTypesPage } from '@/features/catalog/option-types/api';
import { deleteValueSet, listValueSets, restoreValueSet } from './api';
import { ValueSetList } from './value-set-list';

vi.mock('@/features/catalog/option-types/api', () => ({
  listOptionTypesPage: vi.fn(),
}));

vi.mock('./api', () => ({
  listValueSets: vi.fn(),
  getValueSet: vi.fn(),
  deleteValueSet: vi.fn(),
  restoreValueSet: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/en/x7f2k9t3m1qp/catalog/value-sets',
  useSearchParams: () => mockSearchParams,
}));

const mockedListOptionTypesPage = vi.mocked(listOptionTypesPage);
const mockedListValueSets = vi.mocked(listValueSets);
const mockedDeleteValueSet = vi.mocked(deleteValueSet);
const mockedRestoreValueSet = vi.mocked(restoreValueSet);

const mockOptionType: OptionType = {
  id: '11111111-1111-1111-1111-111111111111',
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

function sampleValueSet(id: string, name: string, overrides: Partial<ValueSet> = {}): ValueSet {
  return {
    id,
    name,
    optionTypeId: '11111111-1111-1111-1111-111111111111',
    items: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function openRowMenu(): void {
  const trigger = screen.getAllByRole('button', { name: 'More actions' })[0]!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockedListOptionTypesPage.mockResolvedValue({
    optionTypes: [mockOptionType],
    nextCursor: undefined,
  });
});

afterEach(() => {
  cleanup();
  mockedListOptionTypesPage.mockReset();
  mockedListValueSets.mockReset();
  mockedDeleteValueSet.mockReset();
  mockedRestoreValueSet.mockReset();
});

describe('ValueSetList', () => {
  it('renders the list with a status badge per row', async () => {
    mockedListValueSets.mockResolvedValueOnce([
      sampleValueSet('vs-1', 'Apparel sizes'),
      sampleValueSet('vs-2', 'Shoe sizes'),
    ]);

    renderAdmin(<ValueSetList />);

    expect(await screen.findAllByText('Apparel sizes')).not.toHaveLength(0);
    expect(screen.getAllByText('Shoe sizes')).not.toHaveLength(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('an empty list shows the empty message', async () => {
    mockedListValueSets.mockResolvedValueOnce([]);

    renderAdmin(<ValueSetList />);

    expect(await screen.findByText('No value sets yet.')).toBeInTheDocument();
  });

  it('switching to Archived tab requests archived status', async () => {
    mockedListValueSets.mockResolvedValue([]);

    renderAdmin(<ValueSetList />);

    await screen.findByText('No value sets yet.');

    const archivedTab = screen.getByRole('button', { name: 'Archived' });
    fireEvent.click(archivedTab);

    await waitFor(() => {
      expect(mockedListValueSets).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'archived' }),
      );
    });
  });

  it('deleting a row triggers soft delete request and toast', async () => {
    const item = sampleValueSet('vs-1', 'Apparel sizes');
    mockedListValueSets.mockResolvedValue([item]);
    mockedDeleteValueSet.mockResolvedValueOnce();

    renderAdmin(<ValueSetList />);

    expect(await screen.findAllByText('Apparel sizes')).not.toHaveLength(0);

    openRowMenu();

    const deleteBtn = await screen.findByRole('menuitem', { name: 'Delete' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockedDeleteValueSet).toHaveBeenCalledWith('vs-1');
    });

    expect(await screen.findByText('Value set “Apparel sizes” archived.')).toBeInTheDocument();
  });

  it('restoring an archived row opens confirm dialog and posts restore', async () => {
    const archivedItem = sampleValueSet('vs-archived', 'Old sizes', {
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    mockSearchParams = new URLSearchParams('tab=archived');

    mockedListValueSets.mockResolvedValue([archivedItem]);
    mockedRestoreValueSet.mockResolvedValueOnce(archivedItem);

    renderAdmin(<ValueSetList />);

    expect(await screen.findAllByText('Old sizes')).not.toHaveLength(0);

    openRowMenu();

    const restoreMenuItem = await screen.findByRole('menuitem', { name: 'Restore' });
    fireEvent.click(restoreMenuItem);

    expect(await screen.findByText('Restore value set?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Restore' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedRestoreValueSet).toHaveBeenCalledWith('vs-archived');
    });
  });
});
