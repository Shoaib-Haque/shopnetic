import { useEffect, useRef, useState } from 'react';

export interface UseComboboxKeyboardNavOptions {
  open: boolean;
  itemCount: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  resetOn?: unknown[];
}

export interface UseComboboxKeyboardNavReturn {
  highlightIndex: number;
  setHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  listboxRef: React.RefObject<HTMLDivElement | null>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  getOptionProps: (index: number) => {
    onMouseEnter: () => void;
    isHighlighted: boolean;
  };
}

export function useComboboxKeyboardNav({
  open,
  itemCount,
  onSelect,
  onClose,
  resetOn = [],
}: UseComboboxKeyboardNavOptions): UseComboboxKeyboardNavReturn {
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const listboxRef = useRef<HTMLDivElement | null>(null);

  // Reset highlight when dropdown closes or when search/list results change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [open, ...resetOn]);

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (highlightIndex < 0 || !listboxRef.current) return;
    const option = listboxRef.current.children[highlightIndex] as HTMLElement | undefined;
    if (option?.scrollIntoView) {
      option.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < itemCount - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Home') {
      if (itemCount > 0) {
        e.preventDefault();
        setHighlightIndex(0);
      }
    } else if (e.key === 'End') {
      if (itemCount > 0) {
        e.preventDefault();
        setHighlightIndex(itemCount - 1);
      }
    } else if (e.key === 'PageDown') {
      if (itemCount > 0) {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(itemCount - 1, (prev < 0 ? 0 : prev) + 10));
      }
    } else if (e.key === 'PageUp') {
      if (itemCount > 0) {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(0, prev - 10));
      }
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < itemCount) {
        e.preventDefault();
        onSelect(highlightIndex);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      if (open) {
        onClose();
      }
    }
  };

  const getOptionProps = (index: number) => ({
    onMouseEnter: () => setHighlightIndex(index),
    isHighlighted: index === highlightIndex,
  });

  return {
    highlightIndex,
    setHighlightIndex,
    listboxRef,
    handleKeyDown,
    getOptionProps,
  };
}
