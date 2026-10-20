import { describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCY_CODES,
  currencySchema,
  decimalToMinor,
  formatMoney,
  getCurrencyExponent,
  getCurrencyFactor,
  isSupportedCurrency,
  minorToDecimal,
  normalizeCurrency,
} from '@shopnetic/contracts';
import {
  decimalKeyDownHandler,
  decimalPasteHandler,
  integerKeyDownHandler,
  integerPasteHandler,
  sanitizeDecimalString,
} from './numeric-input';

describe('numeric-input utilities', () => {
  describe('integerKeyDownHandler', () => {
    it('allows digits 0-9', () => {
      for (let i = 0; i <= 9; i++) {
        const preventDefault = vi.fn();
        integerKeyDownHandler({
          key: String(i),
          preventDefault,
          ctrlKey: false,
          metaKey: false,
        } as never);
        expect(preventDefault).not.toHaveBeenCalled();
      }
    });

    it('blocks letters, negative signs, and decimals', () => {
      ['a', 'Z', '-', '+', '.', 'e', ' ', '$'].forEach((char) => {
        const preventDefault = vi.fn();
        integerKeyDownHandler({
          key: char,
          preventDefault,
          ctrlKey: false,
          metaKey: false,
        } as never);
        expect(preventDefault).toHaveBeenCalled();
      });
    });

    it('allows navigation and shortcut keys', () => {
      ['Backspace', 'Tab', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight'].forEach((key) => {
        const preventDefault = vi.fn();
        integerKeyDownHandler({
          key,
          preventDefault,
          ctrlKey: false,
          metaKey: false,
        } as never);
        expect(preventDefault).not.toHaveBeenCalled();
      });

      const preventDefault = vi.fn();
      integerKeyDownHandler({
        key: 'c',
        preventDefault,
        ctrlKey: true,
        metaKey: false,
      } as never);
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('integerPasteHandler', () => {
    it('strips non-digits and calls onChange with sanitized digits', () => {
      const onChange = vi.fn();
      const preventDefault = vi.fn();
      const currentTarget = { value: '' };

      integerPasteHandler(
        {
          preventDefault,
          clipboardData: { getData: () => 'abc-123.45xyz' },
          currentTarget,
        } as never,
        onChange,
      );

      expect(preventDefault).toHaveBeenCalled();
      expect(currentTarget.value).toBe('12345');
      expect(onChange).toHaveBeenCalledWith('12345');
    });
  });

  describe('decimalKeyDownHandler', () => {
    it('allows digits and a single decimal point', () => {
      const preventDefault = vi.fn();
      decimalKeyDownHandler({
        key: '.',
        preventDefault,
        ctrlKey: false,
        metaKey: false,
        currentTarget: { value: '12', selectionStart: 2, selectionEnd: 2 },
      } as never);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('blocks a second decimal point when one already exists and is not selected', () => {
      const preventDefault = vi.fn();
      decimalKeyDownHandler({
        key: '.',
        preventDefault,
        ctrlKey: false,
        metaKey: false,
        currentTarget: { value: '12.50', selectionStart: 5, selectionEnd: 5 },
      } as never);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('blocks decimal point when maxDecimals is 0 (zero-decimal currency)', () => {
      const preventDefault = vi.fn();
      decimalKeyDownHandler(
        {
          key: '.',
          preventDefault,
          ctrlKey: false,
          metaKey: false,
          currentTarget: { value: '150', selectionStart: 3, selectionEnd: 3 },
        } as never,
        0,
      );
      expect(preventDefault).toHaveBeenCalled();
    });

    it('blocks typing past maxDecimals when cursor is in the decimal segment', () => {
      const preventDefault = vi.fn();
      decimalKeyDownHandler(
        {
          key: '9',
          preventDefault,
          ctrlKey: false,
          metaKey: false,
          currentTarget: { value: '12.50', selectionStart: 5, selectionEnd: 5 },
        } as never,
        2,
      );
      expect(preventDefault).toHaveBeenCalled();
    });

    it('blocks non-numeric keys', () => {
      ['a', 'X', '-', 'e', '$'].forEach((char) => {
        const preventDefault = vi.fn();
        decimalKeyDownHandler({
          key: char,
          preventDefault,
          ctrlKey: false,
          metaKey: false,
          currentTarget: { value: '10', selectionStart: 2, selectionEnd: 2 },
        } as never);
        expect(preventDefault).toHaveBeenCalled();
      });
    });
  });

  describe('decimalPasteHandler & sanitizeDecimalString', () => {
    it('sanitizes decimal string properly with maxDecimals', () => {
      expect(sanitizeDecimalString('$123.456')).toBe('123.45');
      expect(sanitizeDecimalString('abc 49.99 usd')).toBe('49.99');
      expect(sanitizeDecimalString('12.34.56')).toBe('12.34');
      expect(sanitizeDecimalString('100')).toBe('100');
      expect(sanitizeDecimalString('150.50', 0)).toBe('150');
      expect(sanitizeDecimalString('¥15,000.75', 0)).toBe('15000');
    });

    it('calls onChange on paste with sanitized decimal', () => {
      const onChange = vi.fn();
      const preventDefault = vi.fn();
      const currentTarget = { value: '' };

      decimalPasteHandler(
        {
          preventDefault,
          clipboardData: { getData: () => '$89.990' },
          currentTarget,
        } as never,
        onChange,
        2,
      );

      expect(preventDefault).toHaveBeenCalled();
      expect(currentTarget.value).toBe('89.99');
      expect(onChange).toHaveBeenCalledWith('89.99');
    });
  });

  describe('currency utilities (contracts)', () => {
    it('returns correct currency exponent and factor', () => {
      expect(getCurrencyExponent('JPY')).toBe(0);
      expect(getCurrencyExponent('jpy')).toBe(0);
      expect(getCurrencyExponent('USD')).toBe(2);
      expect(getCurrencyExponent('EUR')).toBe(2);
      expect(getCurrencyExponent('GBP')).toBe(2);
      expect(getCurrencyExponent(null)).toBe(2);
      expect(getCurrencyExponent(undefined)).toBe(2);
      expect(getCurrencyExponent('UNKNOWN')).toBe(2);

      expect(getCurrencyFactor('JPY')).toBe(1);
      expect(getCurrencyFactor('USD')).toBe(100);
      expect(getCurrencyFactor(null)).toBe(100);
    });

    it('converts minor units to decimal strings accurately', () => {
      expect(minorToDecimal('1500', 'USD')).toBe('15.00');
      expect(minorToDecimal('2999', 'USD')).toBe('29.99');
      expect(minorToDecimal('150', 'JPY')).toBe('150');
      expect(minorToDecimal('0', 'USD')).toBe('0.00');
      expect(minorToDecimal('0', 'JPY')).toBe('0');
      expect(minorToDecimal(null, 'USD')).toBe('');
      expect(minorToDecimal(undefined, 'USD')).toBe('');
      expect(minorToDecimal('', 'USD')).toBe('');
    });

    it('converts decimal strings to minor units accurately', () => {
      expect(decimalToMinor('15.00', 'USD')).toBe('1500');
      expect(decimalToMinor('29.99', 'USD')).toBe('2999');
      expect(decimalToMinor('150', 'JPY')).toBe('150');
      expect(decimalToMinor('0', 'USD')).toBe('0');
      expect(decimalToMinor(null, 'USD')).toBeNull();
      expect(decimalToMinor(undefined, 'USD')).toBeNull();
      expect(decimalToMinor('', 'USD')).toBeNull();
    });

    it('formats monetary values with appropriate symbol and decimals', () => {
      expect(formatMoney('1500', 'USD')).toBe('$15.00');
      expect(formatMoney('150', 'JPY')).toBe('¥150');
      expect(formatMoney('2500', 'EUR')).toBe('€25.00');
      expect(formatMoney('3500', 'GBP')).toBe('£35.00');
      expect(formatMoney('0', 'USD')).toBe('$0.00');
      expect(formatMoney('0', 'JPY')).toBe('¥0');
      expect(formatMoney(null, 'USD')).toBe('—');
      expect(formatMoney(undefined, 'JPY')).toBe('—');
    });

    it('validates supported currency codes via isSupportedCurrency', () => {
      expect(isSupportedCurrency('USD')).toBe(true);
      expect(isSupportedCurrency('usd')).toBe(true);
      expect(isSupportedCurrency('JPY')).toBe(true);
      expect(isSupportedCurrency('jpy')).toBe(true);
      expect(isSupportedCurrency('EUR')).toBe(true);
      expect(isSupportedCurrency('ZZZ')).toBe(false);
      expect(isSupportedCurrency('')).toBe(false);
      expect(isSupportedCurrency(null)).toBe(false);
      expect(isSupportedCurrency(123)).toBe(false);
    });

    it('normalizes currency strings with fallback via normalizeCurrency', () => {
      expect(normalizeCurrency('usd')).toBe('USD');
      expect(normalizeCurrency('USD')).toBe('USD');
      expect(normalizeCurrency('jpy')).toBe('JPY');
      expect(normalizeCurrency('invalid')).toBe('USD');
      expect(normalizeCurrency(null)).toBe('USD');
      expect(normalizeCurrency('invalid', 'EUR')).toBe('EUR');
    });

    it('validates currency schema correctly', () => {
      expect(currencySchema.parse('usd')).toBe('USD');
      expect(currencySchema.parse('JPY')).toBe('JPY');
      expect(() => currencySchema.parse('ZZZ')).toThrow();
    });

    it('contains all 13 expected currencies in SUPPORTED_CURRENCIES', () => {
      expect(SUPPORTED_CURRENCY_CODES).toHaveLength(13);
      expect(SUPPORTED_CURRENCIES).toHaveLength(13);
      expect(SUPPORTED_CURRENCY_CODES).toContain('USD');
      expect(SUPPORTED_CURRENCY_CODES).toContain('JPY');
      expect(SUPPORTED_CURRENCY_CODES).toContain('EUR');
    });
  });
});
