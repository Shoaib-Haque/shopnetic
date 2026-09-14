'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** fired once `value` reaches `length` digits — for auto-submit */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** id for the first cell so a `<label htmlFor>` can point at the group */
  id?: string;
  'aria-label'?: string;
}

/**
 * Segmented one-time-code input — `length` single-digit cells, `0-9` only, with
 * auto-advance, backspace-to-previous, arrow nav, and paste that spreads across
 * cells. `value` is always a contiguous left-anchored prefix (focus is pulled
 * back to the first empty cell), so it maps cleanly to a plain string.
 * plan/CODING-RULES.md section D3.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  id,
  'aria-label': ariaLabel,
}: OtpInputProps) {
  const cells = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.split('').slice(0, length);

  // `onFocus` below needs the *just-committed* value, not last render's: a
  // programmatic `.focus()` call fires its target's onFocus synchronously,
  // before React re-renders — so a closure over the `value` prop is one
  // keystroke stale there and yanks focus straight back to the first empty
  // cell, undoing auto-advance. This ref is updated the instant we commit.
  const latestValue = useRef(value);
  latestValue.current = value;

  const focusCell = (i: number): void => {
    const el = cells.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (nextRaw: string): void => {
    const next = nextRaw.replace(/\D/g, '').slice(0, length);
    latestValue.current = next;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  /** Set the digit at `i` (only ever `i <= value.length` thanks to focus pull). */
  const setAt = (i: number, digit: string): void => {
    const chars = value.split('');
    chars[i] = digit;
    commit(chars.join(''));
  };

  const spreadFrom = (i: number, incoming: string): void => {
    const src = incoming.replace(/\D/g, '');
    if (!src) return;
    const chars = value.split('');
    for (let k = 0; k < src.length && i + k < length; k += 1) chars[i + k] = src[k] ?? '';
    commit(chars.join(''));
    focusCell(Math.min(i + src.length, length - 1));
  };

  const onCellChange = (i: number, raw: string): void => {
    const d = raw.replace(/\D/g, '');
    if (!d) {
      setAt(i, '');
      return;
    }
    if (d.length === 1) {
      setAt(i, d);
      if (i < length - 1) focusCell(i + 1);
      return;
    }
    spreadFrom(i, d); // fast typing / autofill dumping the whole code into one cell
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, '');
      focusCell(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault();
      focusCell(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    spreadFrom(i, pasted);
  };

  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex gap-2', disabled && 'opacity-50')}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            cells.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          maxLength={1}
          disabled={disabled}
          aria-invalid={invalid ?? undefined}
          aria-label={`Digit ${i + 1} of ${length}`}
          value={digits[i] ?? ''}
          onChange={(e) => onCellChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => {
            const firstEmpty = Math.min(latestValue.current.length, length - 1);
            if (i > firstEmpty) focusCell(firstEmpty);
            else e.target.select();
          }}
          className={cn(
            'h-11 w-10 rounded-md border border-input bg-background text-center text-lg font-medium tabular-nums',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed',
            invalid && 'border-destructive focus-visible:ring-destructive',
          )}
        />
      ))}
    </div>
  );
}
