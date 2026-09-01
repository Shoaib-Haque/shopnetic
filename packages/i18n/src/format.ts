import type { Locale } from './config.js';

/**
 * All number / money / date formatting goes through `Intl` — never string
 * concatenation (plan/CODING-RULES.md §L, plan/24 §6). Money is always integer
 * minor units + an ISO currency code.
 */

export interface Money {
  /** integer minor units, e.g. 1299 = $12.99 */
  amount: number;
  currency: string;
}

export function formatMoney(money: Money, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(money.amount / 100);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  date: Date | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, options).format(d);
}
