import type { ClipboardEvent, KeyboardEvent } from 'react';

/**
 * Checks if a key event represents navigation, editing control, or a standard
 * clipboard/history shortcut (Ctrl/Cmd + C, V, X, A, Z, Y).
 */
export function isNavigationOrShortcutKey(e: KeyboardEvent<HTMLInputElement>): boolean {
  if (e.ctrlKey || e.metaKey) {
    return true;
  }
  const allowedKeys = [
    'Backspace',
    'Tab',
    'Enter',
    'Escape',
    'Delete',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];
  return allowedKeys.includes(e.key);
}

/**
 * Restricts key input on whole-number fields to digits 0–9 only.
 * Blocks negative signs (-), scientific notation (e), decimal points (.), and letters.
 */
export function integerKeyDownHandler(e: KeyboardEvent<HTMLInputElement>): void {
  if (isNavigationOrShortcutKey(e)) return;
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
}

/**
 * Sanitizes pasted clipboard content on whole-number inputs, stripping all non-digit characters.
 */
export function integerPasteHandler(
  e: ClipboardEvent<HTMLInputElement>,
  onChange?: (val: string) => void,
): void {
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  const digits = text.replace(/[^0-9]/g, '');
  e.currentTarget.value = digits;
  onChange?.(digits);
}

/**
 * Restricts key input on decimal fields (e.g. currency amounts) to digits and at most
 * one decimal point, limiting decimal digits to `maxDecimals`.
 */
export function decimalKeyDownHandler(e: KeyboardEvent<HTMLInputElement>, maxDecimals = 2): void {
  if (isNavigationOrShortcutKey(e)) return;

  const input = e.currentTarget;
  const val = input.value;
  const selStart = input.selectionStart ?? val.length;
  const selEnd = input.selectionEnd ?? val.length;
  const hasSelection = selEnd > selStart;

  if (e.key === '.') {
    if (maxDecimals === 0 || (val.includes('.') && !val.slice(selStart, selEnd).includes('.'))) {
      e.preventDefault();
    }
    return;
  }

  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    return;
  }

  // If typing a digit after the decimal point, enforce maxDecimals
  const dotIndex = val.indexOf('.');
  if (dotIndex !== -1 && selStart > dotIndex && !hasSelection) {
    const decimals = val.slice(dotIndex + 1);
    if (decimals.length >= maxDecimals) {
      e.preventDefault();
    }
  }
}

/**
 * Sanitizes pasted clipboard content on decimal/price inputs, stripping non-numeric
 * characters and clamping to at most one decimal point and `maxDecimals`.
 */
export function decimalPasteHandler(
  e: ClipboardEvent<HTMLInputElement>,
  onChange?: (val: string) => void,
  maxDecimals = 2,
): void {
  e.preventDefault();
  const text = e.clipboardData.getData('text').trim();
  const sanitized = sanitizeDecimalString(text, maxDecimals);
  e.currentTarget.value = sanitized;
  onChange?.(sanitized);
}

/**
 * Helper to strip non-decimal characters from an arbitrary string.
 */
export function sanitizeDecimalString(input: string, maxDecimals = 2): string {
  // Keep only digits and decimal points
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  if (maxDecimals === 0 || parts.length === 1) {
    return integerPart;
  }
  const decimalPart = parts.slice(1).join('').slice(0, maxDecimals);
  return `${integerPart}.${decimalPart}`;
}

export {
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrencyCode,
  getCurrencyExponent,
  getCurrencyFactor,
} from '@shopnetic/contracts';
