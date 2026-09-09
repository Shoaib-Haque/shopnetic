'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Input } from './input';

/**
 * Search field with a leading magnifier and a trailing clear button (shown only
 * while there's a value). `Esc` also clears. The clear button carries `title` +
 * `aria-label` from `clearLabel` (pass a localized string). `onClear` fires only
 * on an explicit clear (button / Esc), not on every edit down to empty — wire it
 * to a re-fetch if a cleared field should reload its list.
 */
export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  /** localized label for the clear button — tooltip + `aria-label`. */
  clearLabel?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, onClear, clearLabel = 'Clear', className, ...props },
  ref,
) {
  const clear = (): void => {
    onValueChange('');
    onClear?.();
  };
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            clear();
          }
        }}
        className="h-9 pl-8 pr-8 [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
});
