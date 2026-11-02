'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import type { Brand } from '@shopnetic/contracts';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@shopnetic/ui';
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
        }
      } catch {
        if (active) {
          setSearchResults(null);
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
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* None / Unbranded Option */}
          <button
            type="button"
            role="option"
            aria-label={noBrandLabel}
            aria-selected={!value}
            onClick={() => {
              onChange('');
              setOpen(false);
              setQuery('');
            }}
            className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left ${
              !value ? 'bg-accent/80 font-medium text-accent-foreground' : 'text-muted-foreground'
            }`}
          >
            <span>{noBrandLabel}</span>
            {!value && <Check className="size-3.5 shrink-0 text-primary" />}
          </button>

          {displayedBrands.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            displayedBrands.map((b) => {
              const isSelected = b.id === value;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-label={b.name}
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left ${
                    isSelected
                      ? 'bg-accent/80 font-medium text-accent-foreground'
                      : 'text-foreground'
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
