'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import type { SellerStatus, SellerWithShop } from '@shopnetic/contracts';
import { Popover, PopoverContent, PopoverTrigger, SearchInput, StatusBadge } from '@shopnetic/ui';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useScrollLoad } from '@/components/crud/use-scroll-load';
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
  const debouncedQuery = useDebouncedSearch(query);

  const fetchPage = useCallback(
    (cursor: string | undefined) =>
      listSellersPage({
        q: debouncedQuery.trim() || undefined,
        status: statusFilter,
        cursor,
        limit: 50,
      }).then((res) => ({ items: res.sellers, nextCursor: res.nextCursor })),
    [debouncedQuery, statusFilter],
  );

  const { items, loading, loadingMore, loadError, sentinelRef } = useScrollLoad<SellerWithShop>(
    fetchPage,
    [debouncedQuery, statusFilter],
    open,
  );

  const knownSellers = useMemo(() => {
    const map = new Map<string, SellerWithShop>();
    for (const s of sellers) map.set(s.id, s);
    for (const s of items) map.set(s.id, s);
    return Array.from(map.values());
  }, [sellers, items]);

  const selectedSeller = useMemo(
    () => knownSellers.find((s) => s.id === value),
    [knownSellers, value],
  );

  const selectedLabel = useMemo(
    () => (selectedSeller ? formatSellerLabel(selectedSeller).fullText : null),
    [selectedSeller],
  );

  const displayedSellers = useMemo(() => {
    if (items.length > 0) return items;
    if (!loading && !loadError) return [];
    // While loading initial page or on load error, fall back to passed-in prop sellers
    const q = debouncedQuery.trim().toLowerCase();
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
  }, [items, loading, loadError, sellers, debouncedQuery, statusFilter]);

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

  const isSearching = loading || query !== debouncedQuery;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
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
        <SearchInput
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleKeyDown}
          placeholder="Search sellers…"
          isLoading={isSearching}
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
          {displayedSellers.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No sellers found</div>
          ) : (
            <>
              {displayedSellers.map((s, index) => {
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
              })}
              {loadingMore ? (
                <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Loading more…</span>
                </div>
              ) : null}
              <div ref={sentinelRef} data-testid="seller-combobox-sentinel" />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
