import { describe, expect, it } from 'vitest';
import { extractErrorCode } from './error-code.js';

describe('extractErrorCode', () => {
  it('pulls the code out of an error envelope', () => {
    expect(extractErrorCode({ error: { code: 'RATE_LIMITED' } })).toBe('RATE_LIMITED');
  });

  it('returns undefined for a body with no error envelope', () => {
    expect(extractErrorCode({ data: {} })).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode(undefined)).toBeUndefined();
    expect(extractErrorCode('not an object')).toBeUndefined();
  });

  it('returns undefined when error.code is present but not a string', () => {
    expect(extractErrorCode({ error: { code: 123 } })).toBeUndefined();
    expect(extractErrorCode({ error: {} })).toBeUndefined();
  });
});
