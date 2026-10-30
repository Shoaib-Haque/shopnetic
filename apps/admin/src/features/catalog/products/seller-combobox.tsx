'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { Input, Popover, PopoverContent, PopoverTrigger, StatusBadge } from '@shopnetic/ui';

export interface SellerComboboxProps {
  id?: string;
  value: string;
  onChange: (sellerId: string) => void;
  sellers: SellerWithShop[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export function formatSellerLabel(s: SellerWithShop): {
  name: string;
  tag: '1P' | '3P';
  handle: string;
  fullText: string;
} {
  const is1P = s.shop?.slug === 'shopnetic-retail';
  const tag: '1P' | '3P' = is1P ? '1P' : '3P';
  const name = s.shop?.displayName ?? s.legalName ?? s.id;
  const handle = s.shop?.slug ? `@${s.shop.slug}` : `#${s.id.slice(0, 8)}`;
  return {
    name,
    tag,
    handle,
    fullText: `${name} (${tag}) • ${handle}`,
  };
}

export function SellerCombobox({
  id,
  value,
  onChange,
  sellers,
  disabled = false,
  invalid = false,
  placeholder = 'Select seller…',
  ariaLabel = 'Seller',
}: SellerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSeller = useMemo(() => sellers.find((s) => s.id === value), [sellers, value]);

  const selectedLabel = useMemo(
    () => (selectedSeller ? formatSellerLabel(selectedSeller).fullText : null),
    [selectedSeller],
  );

  const filteredSellers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) => {
      const { name, handle } = formatSellerLabel(s);
      return (
        name.toLowerCase().includes(q) ||
        handle.toLowerCase().includes(q) ||
        s.legalName?.toLowerCase().includes(q)
      );
    });
  }, [sellers, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
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
              selectedLabel ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {selectedLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] max-w-[28rem] p-2 shadow-lg z-[60]"
      >
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sellers…"
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div role="listbox" className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
          {filteredSellers.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No sellers found</div>
          ) : (
            filteredSellers.map((s) => {
              const { name, tag, handle, fullText } = formatSellerLabel(s);
              const isSelected = s.id === value;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-label={fullText}
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors text-left ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title={fullText}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <span className="truncate">{name}</span>
                    <StatusBadge
                      tone={tag === '1P' ? 'neutral' : 'warning'}
                      className="text-[9px] px-1 py-0 shrink-0"
                    >
                      {tag}
                    </StatusBadge>
                    <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                      {handle}
                    </span>
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
