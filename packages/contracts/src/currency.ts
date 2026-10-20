import { z } from 'zod';

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD ($)', symbol: '$', exponent: 2 },
  { code: 'EUR', label: 'EUR (€)', symbol: '€', exponent: 2 },
  { code: 'GBP', label: 'GBP (£)', symbol: '£', exponent: 2 },
  { code: 'CAD', label: 'CAD ($)', symbol: 'CA$', exponent: 2 },
  { code: 'AUD', label: 'AUD ($)', symbol: 'AU$', exponent: 2 },
  { code: 'JPY', label: 'JPY (¥)', symbol: '¥', exponent: 0 },
  { code: 'CHF', label: 'CHF (Fr)', symbol: 'CHF', exponent: 2 },
  { code: 'CNY', label: 'CNY (¥)', symbol: 'CN¥', exponent: 2 },
  { code: 'INR', label: 'INR (₹)', symbol: '₹', exponent: 2 },
  { code: 'SGD', label: 'SGD ($)', symbol: 'SG$', exponent: 2 },
  { code: 'NZD', label: 'NZD ($)', symbol: 'NZ$', exponent: 2 },
  { code: 'BRL', label: 'BRL (R$)', symbol: 'R$', exponent: 2 },
  { code: 'MXN', label: 'MXN ($)', symbol: 'MX$', exponent: 2 },
] as const;

export const SUPPORTED_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'SGD',
  'NZD',
  'BRL',
  'MXN',
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const currencySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
  z.enum(SUPPORTED_CURRENCY_CODES, {
    errorMap: () => ({
      message: `Unsupported currency code. Must be one of: ${SUPPORTED_CURRENCY_CODES.join(', ')}`,
    }),
  }),
);

export type Currency = z.infer<typeof currencySchema>;

export function isSupportedCurrency(val: unknown): val is Currency {
  return currencySchema.safeParse(val).success;
}

export function normalizeCurrency(val: unknown, fallback: Currency = 'USD'): Currency {
  const result = currencySchema.safeParse(val);
  return result.success ? result.data : fallback;
}

export function getCurrencyExponent(currencyCode?: string | null): number {
  if (!currencyCode) return 2;
  const match = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode.toUpperCase());
  return match ? match.exponent : 2;
}

export function getCurrencyFactor(currencyCode?: string | null): number {
  const exponent = getCurrencyExponent(currencyCode);
  return Math.pow(10, exponent);
}

export function minorToDecimal(
  minor: string | number | null | undefined,
  currency?: string | null,
): string {
  if (minor === null || minor === undefined || minor === '') return '';
  const factor = getCurrencyFactor(currency);
  const exponent = getCurrencyExponent(currency);
  const num = Number(minor) / factor;
  return isNaN(num) ? '' : num.toFixed(exponent);
}

export function decimalToMinor(
  decimal: string | number | null | undefined,
  currency?: string | null,
): string | null {
  if (decimal === null || decimal === undefined || decimal === '') return null;
  const str = typeof decimal === 'number' ? decimal.toString() : decimal.trim();
  if (!str) return null;
  const num = parseFloat(str);
  if (isNaN(num) || num < 0) return null;
  const factor = getCurrencyFactor(currency);
  return Math.round(num * factor).toString();
}

export function formatMoney(
  minor: string | number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US',
): string {
  if (minor === null || minor === undefined || minor === '') return '—';
  const factor = getCurrencyFactor(currency);
  const val = Number(minor) / factor;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(val);
}
