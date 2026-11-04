'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { Category } from '@shopnetic/contracts';
import { Popover, PopoverContent, PopoverTrigger, SearchInput } from '@shopnetic/ui';
import { useComboboxKeyboardNav } from '@/hooks/use-combobox-keyboard-nav';

export interface CategoryComboboxProps {
  id?: string;
  value: string;
  onChange: (categoryId: string) => void;
  categories: Category[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
}

export function formatCategoryBreadcrumb(
  category: Category,
  categoryMap: Map<string, Category>,
): string {
  const parts: string[] = [];
  let current: Category | undefined = category;

  while (current) {
    const name = current.name['en'] || current.slug;
    parts.unshift(name);
    if (!current.parentId) break;
    current = categoryMap.get(current.parentId);
  }

  return parts.join(' > ');
}

export function CategoryCombobox({
  id,
  value,
  onChange,
  categories,
  disabled = false,
  invalid = false,
  placeholder = 'Select category…',
  searchPlaceholder = 'Search categories…',
  emptyText = 'No categories found',
  ariaLabel = 'Category',
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const items = useMemo(() => {
    return categories.map((c) => {
      const name = c.name['en'] || c.slug;
      const breadcrumb = formatCategoryBreadcrumb(c, categoryMap);
      const isChild = c.parentId != null;
      return {
        id: c.id,
        name,
        breadcrumb,
        isChild,
        category: c,
      };
    });
  }, [categories, categoryMap]);

  const selectedItem = useMemo(() => items.find((it) => it.id === value), [items, value]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.breadcrumb.toLowerCase().includes(q) ||
        it.category.slug.toLowerCase().includes(q),
    );
  }, [items, query]);

  const { listboxRef, handleKeyDown, getOptionProps } = useComboboxKeyboardNav({
    open,
    itemCount: filteredItems.length,
    onSelect: (index) => {
      const selected = filteredItems[index];
      if (selected) {
        onChange(selected.id);
        setOpen(false);
        setQuery('');
      }
    },
    onClose: () => setOpen(false),
    resetOn: [filteredItems],
  });

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
              selectedItem ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {selectedItem ? selectedItem.breadcrumb : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        hideClose
        className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] max-w-[32rem] p-2 shadow-lg z-[60]"
        onWheel={(e) => e.stopPropagation()}
      >
        <SearchInput
          value={query}
          onValueChange={setQuery}
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
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            filteredItems.map((it, index) => {
              const isSelected = it.id === value;
              const { onMouseEnter, isHighlighted } = getOptionProps(index);
              return (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-label={it.breadcrumb}
                  aria-selected={isSelected}
                  onMouseEnter={onMouseEnter}
                  onClick={() => {
                    onChange(it.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-start justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left ${
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
                    <span className="font-medium truncate">{it.name}</span>
                    {it.isChild && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {it.breadcrumb}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 text-primary mt-0.5" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
