'use client';

import { useMemo, useState } from 'react';
import { cn, Popover, PopoverContent, PopoverTrigger, SearchInput } from '@shopnetic/ui';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
import { matchScore, tokenize } from '@/lib/search';

export interface OptionValueItem {
  id: string;
  code: string;
  label: string;
  swatchHex?: string | null | undefined;
}

export interface OptionValueComboboxProps {
  id?: string;
  value: string;
  onChange: (valueId: string) => void;
  values: OptionValueItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  align?: 'start' | 'end' | 'center';
  triggerClassName?: string;
}

export function OptionValueCombobox({
  id,
  value,
  onChange,
  values,
  placeholder = 'Select a value…',
  searchPlaceholder = 'Search values…',
  emptyText = 'No values found',
  ariaLabel,
  disabled = false,
  compact = false,
  align = 'start',
  triggerClassName,
}: OptionValueComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedItem = useMemo(() => values.find((v) => v.id === value), [values, value]);

  const filteredValues = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return values;
    const tokens = tokenize(trimmed, { minLength: 1 });
    if (tokens.length === 0) return values;
    return values
      .map((v) => {
        const code = v.code.toLowerCase();
        const label = v.label.toLowerCase();
        const text = `${code} ${label}`;

        let score = 0;
        if (code === trimmed) {
          score += 100;
        } else if (label === trimmed) {
          score += 80;
        } else if (code.startsWith(trimmed)) {
          score += 50;
        } else if (label.startsWith(trimmed)) {
          score += 30;
        }

        const tokenScore = matchScore(text, tokens);
        score += tokenScore;

        return { v, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ v }) => v);
  }, [values, search]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: filteredValues.length,
    onSelect: (index) => {
      const item = filteredValues[index];
      if (item) {
        onChange(item.id);
        setOpen(false);
        setSearch('');
      }
    },
    onClose: () => setOpen(false),
    resetOn: [filteredValues],
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-input bg-background shadow-xs transition-colors',
            'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'h-7 px-2 py-0 text-xs min-w-0 flex-1' : 'h-9 px-3 py-1.5 text-xs',
            triggerClassName,
          )}
        >
          <div className="flex items-center gap-1.5 truncate text-left min-w-0">
            {selectedItem?.swatchHex && (
              <span
                className="size-3 shrink-0 rounded-full border border-border shadow-xs"
                style={{ backgroundColor: selectedItem.swatchHex }}
                title={selectedItem.swatchHex}
              />
            )}
            <span
              className={cn('truncate', selectedItem ? 'text-foreground' : 'text-muted-foreground')}
            >
              {selectedItem
                ? selectedItem.code && selectedItem.code !== selectedItem.label && !compact
                  ? `${selectedItem.label} (${selectedItem.code})`
                  : selectedItem.label
                : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] max-w-[20rem] p-2 shadow-lg z-[60]"
        onWheel={(e) => e.stopPropagation()}
      >
        <SearchInput
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleKeyDown}
          placeholder={searchPlaceholder}
          className="mb-2"
          inputClassName="h-8 text-xs"
          autoFocus
        />
        <div
          ref={listboxRef}
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filteredValues.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            filteredValues.map((val, index) => {
              const isSelected = val.id === value;
              const { onMouseEnter, isHighlighted } = getOptionProps(index);
              return (
                <button
                  key={val.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(val.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-medium'
                      : isHighlighted
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted/70',
                  )}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {val.swatchHex && (
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-border shadow-xs"
                        style={{ backgroundColor: val.swatchHex }}
                        title={val.swatchHex}
                      />
                    )}
                    <span className="truncate">{val.label}</span>
                    {val.code && val.code !== val.label && (
                      <span
                        className={cn(
                          'font-mono text-[10px] shrink-0',
                          isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        )}
                      >
                        ({val.code})
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 ml-1.5" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
