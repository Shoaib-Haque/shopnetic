'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import type { Brand } from '@shopnetic/contracts';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@shopnetic/ui';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
import { listBrandsPage } from '@/features/catalog/brands/api';

export interface BrandComboboxProps {
  id?: string;
  value: string;
  onChange: (brandId: string) => void;
  brands: Brand[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  noBrandLabel?: string;
  emptyText?: string;
  ariaLabel?: string;
}

export function BrandCombobox({
  id,
  value,
  onChange,
  brands,
  disabled = false,
  invalid = false,
  placeholder = 'Select brand…',
  searchPlaceholder = 'Search brands…',
  noBrandLabel = 'None (unbranded)',
  emptyText = 'No brands found',
  ariaLabel = 'Brand',
}: BrandComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Brand[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const knownBrands = useMemo(() => {
    const map = new Map<string, Brand>();
    for (const b of brands) map.set(b.id, b);
    if (searchResults) {
      for (const b of searchResults) map.set(b.id, b);
    }
    return Array.from(map.values());
  }, [brands, searchResults]);

  const selectedBrand = useMemo(
    () => (value ? knownBrands.find((b) => b.id === value) : null),
    [knownBrands, value],
  );

  const selectedLabel = useMemo(() => {
    if (!value) return noBrandLabel;
    if (selectedBrand) return selectedBrand.name;
    return placeholder;
  }, [value, selectedBrand, noBrandLabel, placeholder]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open) {
      setSearchResults(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await listBrandsPage({
          ...(trimmed ? { q: trimmed } : {}),
          limit: 30,
        });
        if (active) {
          setSearchResults(res.brands);
          setNextCursor(res.nextCursor);
        }
      } catch {
        if (active) {
          setSearchResults(null);
          setNextCursor(undefined);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || searching) return;
    setLoadingMore(true);
    try {
      const trimmed = query.trim();
      const res = await listBrandsPage({
        ...(trimmed ? { q: trimmed } : {}),
        cursor: nextCursor,
        limit: 30,
      });
      setSearchResults((prev) => [...(prev ?? brands), ...res.brands]);
      setNextCursor(res.nextCursor);
    } catch {
      // Ignore pagination errors
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && nextCursor && !loadingMore && !searching) {
      void loadMore();
    }
  };

  const displayedBrands = useMemo(() => {
    if (searchResults !== null) {
      return searchResults;
    }
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.displayName?.en && b.displayName.en.toLowerCase().includes(q)),
    );
  }, [searchResults, brands, query]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: 1 + displayedBrands.length,
    onSelect: (index) => {
      if (index === 0) {
        onChange('');
      } else {
        const b = displayedBrands[index - 1];
        if (b) onChange(b.id);
      }
      setOpen(false);
      setQuery('');
    },
    onClose: () => setOpen(false),
    resetOn: [displayedBrands],
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setSearchResults(null);
        }
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
          className={`flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
            invalid ? 'border-destructive' : 'border-border'
          }`}
        >
          <span
            className={`truncate text-left ${
              value ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}
          >
            {selectedLabel}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] max-w-[28rem] p-2 shadow-lg z-[60]"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="relative mb-2">
          {searching ? (
            <Loader2 className="absolute left-2.5 top-2.5 size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          )}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div
          ref={listboxRef}
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
          onScroll={handleScroll}
        >
          {/* None / Unbranded Option */}
          {(() => {
            const { onMouseEnter, isHighlighted } = getOptionProps(0);
            return (
              <button
                type="button"
                role="option"
                aria-label={noBrandLabel}
                aria-selected={!value}
                onMouseEnter={onMouseEnter}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                  setQuery('');
                }}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left ${
                  !value
                    ? isHighlighted
                      ? 'bg-accent font-medium text-accent-foreground ring-1 ring-accent-foreground/20'
                      : 'bg-accent/80 font-medium text-accent-foreground'
                    : isHighlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span>{noBrandLabel}</span>
                {!value && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })()}

          {displayedBrands.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            displayedBrands.map((b, index) => {
              const optionIndex = index + 1;
              const isSelected = b.id === value;
              const { onMouseEnter, isHighlighted } = getOptionProps(optionIndex);
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-label={b.name}
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left ${
                    isSelected
                      ? isHighlighted
                        ? 'bg-accent font-medium text-accent-foreground ring-1 ring-accent-foreground/20'
                        : 'bg-accent/80 font-medium text-accent-foreground'
                      : isHighlighted
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-medium truncate">{b.name}</span>
                    {b.displayName?.en && b.displayName.en !== b.name && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {b.displayName.en}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
          {loadingMore && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
              <span>Loading more…</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
