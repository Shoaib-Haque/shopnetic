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

  it('jumps to first item on Home and last item on End', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 15,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const preventDefault = vi.fn();

    // End jumps to index 14
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('End', preventDefault));
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.highlightIndex).toBe(14);

    // Home jumps to index 0
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Home', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(0);
  });

  it('navigates in steps of 10 on PageDown and PageUp', () => {
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 25,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const preventDefault = vi.fn();

    // From -1, PageDown jumps to 10
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageDown', preventDefault));
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.highlightIndex).toBe(10);

    // PageDown again jumps to 20
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(20);

    // PageDown again caps at itemCount - 1 (24)
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageDown', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(24);

    // PageUp jumps back down by 10 to 14
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(14);

    // PageUp floors at 0
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(4);
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('PageUp', preventDefault));
    });
    expect(result.current.highlightIndex).toBe(0);
  });

  it('calls onClose on Tab when dropdown is open without preventing default', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useComboboxKeyboardNav({
        open: true,
        itemCount: 5,
        onSelect: vi.fn(),
        onClose,
      }),
    );

    const preventDefault = vi.fn();

    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Tab', preventDefault));
    });
    expect(onClose).toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
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
