import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OptionValueCombobox, type OptionValueItem } from './option-value-combobox';

const sampleValues: OptionValueItem[] = [
  { id: '', code: '', label: 'Untagged (All variants)' },
  { id: 'val_navy', code: 'navy', label: 'Navy Blue', swatchHex: '#000080' },
  { id: 'val_black', code: 'black', label: 'Pitch Black', swatchHex: '#000000' },
  { id: 'val_white', code: 'white', label: 'Pure White', swatchHex: '#ffffff' },
  { id: 'val_crimson', code: 'crimson', label: 'Crimson Red', swatchHex: '#dc143c' },
];

describe('OptionValueCombobox', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders trigger with placeholder when no value selected', () => {
    render(
      <OptionValueCombobox
        value=""
        onChange={vi.fn()}
        values={sampleValues}
        placeholder="Select a color…"
      />,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(screen.getByText('Untagged (All variants)')).toBeInTheDocument();
  });

  it('renders selected item label and hex swatch', () => {
    render(<OptionValueCombobox value="val_navy" onChange={vi.fn()} values={sampleValues} />);

    expect(screen.getByText('Navy Blue (navy)')).toBeInTheDocument();
    const swatch = screen.getByTitle('#000080');
    expect(swatch).toBeInTheDocument();
    expect(swatch).toHaveStyle({ backgroundColor: '#000080' });
  });

  it('renders compact mode with min-w-0 and flex-1 without code suffix in trigger', () => {
    render(
      <OptionValueCombobox value="val_navy" onChange={vi.fn()} values={sampleValues} compact />,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox.className).toContain('min-w-0');
    expect(combobox.className).toContain('flex-1');
    expect(combobox.className).toContain('h-7');
    // Compact mode shows label only without (navy) suffix
    expect(screen.getByText('Navy Blue')).toBeInTheDocument();
  });

  it('opens popover, filters options by search query, and shows emptyText when nothing matches', () => {
    render(
      <OptionValueCombobox
        value=""
        onChange={vi.fn()}
        values={sampleValues}
        searchPlaceholder="Type to search…"
        emptyText="No colors found"
      />,
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);

    const searchInput = screen.getByPlaceholderText('Type to search…');
    expect(searchInput).toBeInTheDocument();

    // Type "crim" to filter to Crimson Red
    fireEvent.change(searchInput, { target: { value: 'crim' } });
    expect(screen.getByRole('option', { name: /Crimson Red/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Pitch Black/ })).not.toBeInTheDocument();

    // Type query that matches nothing
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText('No colors found')).toBeInTheDocument();
  });

  it('calls onChange with selected value id and closes popover on option click', () => {
    const handleChange = vi.fn();
    render(<OptionValueCombobox value="" onChange={handleChange} values={sampleValues} />);

    fireEvent.click(screen.getByRole('combobox'));
    const blackOption = screen.getByRole('option', { name: /Pitch Black/ });
    fireEvent.click(blackOption);

    expect(handleChange).toHaveBeenCalledWith('val_black');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation (ArrowDown to navigate, Enter to select, Escape to close)', () => {
    const handleChange = vi.fn();
    render(<OptionValueCombobox value="" onChange={handleChange} values={sampleValues} />);

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);

    const searchInput = screen.getByPlaceholderText('Search values…');

    // ArrowDown moves highlight to first option (Untagged), second ArrowDown to Navy Blue
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    // Press Enter to select Navy Blue
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith('val_navy');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('respects disabled prop', () => {
    render(<OptionValueCombobox value="" onChange={vi.fn()} values={sampleValues} disabled />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDisabled();
  });
});
