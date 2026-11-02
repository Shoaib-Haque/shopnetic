export interface CountryOption {
  code: string;
  name: string;
}

export const COUNTRIES: readonly CountryOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'CN', name: 'China' },
  { code: 'SG', name: 'Singapore' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'KR', name: 'South Korea' },
] as const;

export const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  AU: /^\d{4}$/,
  JP: /^\d{3}-?\d{4}$/,
  IT: /^\d{5}$/,
  ES: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Za-z]{2}$/,
  IN: /^\d{6}$/,
  BR: /^\d{5}-?\d{3}$/,
  MX: /^\d{5}$/,
  CN: /^\d{6}$/,
  SG: /^\d{6}$/,
  NZ: /^\d{4}$/,
  IE: /^([A-Za-z]\d{2}|[A-Za-z]{2}\d{2})\s?[A-Za-z\d]{4}$/,
  CH: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/,
  NO: /^\d{4}$/,
  DK: /^\d{4}$/,
  FI: /^\d{5}$/,
  AT: /^\d{4}$/,
  BE: /^\d{4}$/,
  PL: /^\d{2}-\d{3}$/,
  PT: /^\d{4}-\d{3}$/,
  ZA: /^\d{4}$/,
  KR: /^\d{5}$/,
};

export function isValidPostalCode(postalCode: string, countryCode: string): boolean {
  const pattern = POSTAL_CODE_PATTERNS[countryCode.toUpperCase()];
  if (!pattern) return true;
  return pattern.test(postalCode.trim());
}
