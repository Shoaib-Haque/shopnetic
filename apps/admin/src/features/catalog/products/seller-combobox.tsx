'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import type { SellerStatus, SellerWithShop } from '@shopnetic/contracts';
import { Input, Popover, PopoverContent, PopoverTrigger, StatusBadge } from '@shopnetic/ui';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
import { listSellersPage } from '@/features/sellers/api';

export interface SellerComboboxProps {
  id?: string;
  value: string;
  onChange: (sellerId: string) => void;
  sellers: SellerWithShop[];
  statusFilter?: SellerStatus;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export function formatSellerLabel(s: SellerWithShop): {
  name: string;
  tag: '1P' | '3P';
  fullText: string;
} {
  const is1P = s.shop?.slug === 'shopnetic-retail';
  const tag: '1P' | '3P' = is1P ? '1P' : '3P';
  const name = s.shop?.displayName || s.legalName || s.id;
  return {
    name,
    tag,
    fullText: `${name} (${tag})`,
  };
}

export function SellerCombobox({
  id,
  value,
  onChange,
  sellers,
  statusFilter = 'approved',
  disabled = false,
  invalid = false,
  placeholder = 'Select seller…',
  ariaLabel = 'Seller',
}: SellerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SellerWithShop[] | null>(null);
  const [searching, setSearching] = useState(false);

  const knownSellers = useMemo(() => {
    const map = new Map<string, SellerWithShop>();
    for (const s of sellers) map.set(s.id, s);
    if (searchResults) {
      for (const s of searchResults) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [sellers, searchResults]);

  const selectedSeller = useMemo(
    () => knownSellers.find((s) => s.id === value),
    [knownSellers, value],
  );

  const selectedLabel = useMemo(
    () => (selectedSeller ? formatSellerLabel(selectedSeller).fullText : null),
    [selectedSeller],
  );

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
        const res = await listSellersPage({
          q: trimmed || undefined,
          status: statusFilter,
          limit: 50,
        });
        if (active) {
          setSearchResults(res.sellers);
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
  }, [open, query, statusFilter]);

  const displayedSellers = useMemo(() => {
    if (searchResults !== null) {
      return searchResults;
    }
    const q = query.trim().toLowerCase();
    const filteredByStatus = statusFilter
      ? sellers.filter((s) => s.status === statusFilter)
      : sellers;
    if (!q) return filteredByStatus;
    return filteredByStatus.filter((s) => {
      const { name } = formatSellerLabel(s);
      return (
        name.toLowerCase().includes(q) ||
        s.shop?.slug?.toLowerCase().includes(q) ||
        s.legalName?.toLowerCase().includes(q)
      );
    });
  }, [searchResults, sellers, query, statusFilter]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: displayedSellers.length,
    onSelect: (index) => {
      const selected = displayedSellers[index];
      if (selected) {
        onChange(selected.id);
        setOpen(false);
        setQuery('');
      }
    },
    onClose: () => setOpen(false),
    resetOn: [displayedSellers],
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
            placeholder="Search sellers…"
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div
          ref={listboxRef}
          role="listbox"
          className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {displayedSellers.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No sellers found</div>
          ) : (
            displayedSellers.map((s, index) => {
              const { name, tag, fullText } = formatSellerLabel(s);
              const isSelected = s.id === value;
              const { onMouseEnter, isHighlighted } = getOptionProps(index);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-label={fullText}
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors text-left ${
                    isSelected
                      ? isHighlighted
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'bg-primary/10 text-primary font-medium'
                      : isHighlighted
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted'
                  }`}
                  title={fullText}
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{name}</span>
                      <StatusBadge
                        tone={tag === '1P' ? 'neutral' : 'warning'}
                        className="text-[9px] px-1 py-0 shrink-0"
                      >
                        {tag}
                      </StatusBadge>
                    </div>
                    {s.legalName &&
                    s.shop?.displayName &&
                    s.legalName.toLowerCase() !== s.shop.displayName.toLowerCase() ? (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {s.legalName}
                      </span>
                    ) : null}
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
