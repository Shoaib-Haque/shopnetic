import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Plain table primitives (plan/CODING-RULES.md D1) — hairline row borders, a
 * sticky header, row hover. No `'use client'`: they're static markup that
 * composes inside a client list. Wrap in a horizontal scroller for wide tables.
 */
export function Table({
  className,
  scrollX = true,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  /**
   * Horizontal scroll for wide tables (default). `overflow-x-auto` also makes
   * the wrapper a *vertical* scroll container, which traps a `sticky` header —
   * so pass `false` for a `table-fixed` table that can't outgrow its parent:
   * `overflow: clip` (both axes) rounds the corners cleanly and, unlike
   * `auto`/`scroll`/`hidden`, is *not* a scroll container, so the header still
   * sticks to the page. `clip` on one axis only leaves the other corners square.
   */
  scrollX?: boolean;
}) {
  return (
    // `rounded-[inherit]`: an overflow container clips its own box, so without
    // this the table's square corners bleed past a rounded wrapper's border.
    <div className={cn('w-full rounded-[inherit]', scrollX ? 'overflow-x-auto' : 'overflow-clip')}>
      <table
        className={cn('w-full caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'sticky top-0 z-10 bg-background [&_th]:border-b [&_th]:border-border',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors last:border-0 hover:bg-muted/40',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
