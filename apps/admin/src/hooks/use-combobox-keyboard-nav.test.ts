import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComboboxKeyboardNav } from './use-combobox-keyboard-nav';

const makeKeyEvent = (key: string, preventDefault = vi.fn()) =>
  ({
    key,
    preventDefault,
  }) as never;

describe('useComboboxKeyboardNav', () => {
  it('starts with highlightIndex = -1', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 5,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(result.current.highlightIndex).toBe(-1);
  });

  it('increments highlightIndex on ArrowDown and caps at itemCount - 1', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const preventDefault = vi.fn();

    // -1 -> 0
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(0);
    expect(preventDefault).toHaveBeenCalled();

    // 0 -> 1
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(1);

    // 1 -> 2 (capped at length 3 - 1)
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(2);

    // 2 -> 2 (does not exceed 2)
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(2);
  });

  it('decrements highlightIndex on ArrowUp and floors at 0', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const preventDefault = vi.fn();

    // Set highlight to 2
    act(() => result.current.setHighlightIndex(2));

    // 2 -> 1
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(1);

    // 1 -> 0
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(0);

    // 0 -> 0 (does not go negative via ArrowUp)
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(0);
  });

  it('calls onSelect with highlightIndex on Enter when valid', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 3,
        onSelect,
        onClose: vi.fn(),
      }),
    );

    const preventDefault = vi.fn();

    // Highlight is -1, Enter should do nothing
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Enter', preventDefault));
    });
    expect(onSelect).not.toHaveBeenCalled();

    // Highlight 1
    act(() => result.current.setHighlightIndex(1));

    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Enter', preventDefault));
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 3,
        onSelect: vi.fn(),
        onClose,
      }),
    );

    const preventDefault = vi.fn();

    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Escape', preventDefault));
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('provides getOptionProps with onMouseEnter and isHighlighted', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const optionProps = result.current.getOptionProps(1);
    expect(optionProps.isHighlighted).toBe(false);

    act(() => optionProps.onMouseEnter());
    expect(result.current.highlightIndex).toBe(1);
    expect(result.current.getOptionProps(1).isHighlighted).toBe(true);
  });

  it('resets highlightIndex to -1 when resetOn dependencies change', () => {
    const { result, rerender } = renderHook(
      ({ query }) =>
        useComboboxKeyboardNav({
          open: true,
          itemCount: 3,
          onSelect: vi.fn(),
          onClose: vi.fn(),
          resetOn: [query],
        }),
      { initialProps: { query: 'foo' } },
    );

    act(() => result.current.setHighlightIndex(1));
    expect(result.current.highlightIndex).toBe(1);

    rerender({ query: 'bar' });
    expect(result.current.highlightIndex).toBe(-1);
  });
});
