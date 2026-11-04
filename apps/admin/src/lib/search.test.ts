import { describe, expect, it } from 'vitest';
import { matchScore, tokenize } from './search';

describe('search utilities', () => {
  describe('tokenize', () => {
    it('defaults to ignoring single-character tokens (minLength: 2)', () => {
      expect(tokenize('s m l')).toEqual([]);
      expect(tokenize('red white')).toEqual(['red', 'white']);
    });

    it('supports minLength: 1 for short option codes like clothing sizes', () => {
      expect(tokenize('s m l', { minLength: 1 })).toEqual(['s', 'm', 'l']);
      expect(tokenize('xs s m l xl', { minLength: 1 })).toEqual(['xs', 's', 'm', 'l', 'xl']);
    });

    it('deduplicates tokens and caps at MAX_TOKENS', () => {
      expect(tokenize('red red RED blue')).toEqual(['red', 'blue']);
    });
  });

  describe('matchScore', () => {
    it('returns 0 for empty tokens', () => {
      expect(matchScore('Small Size', [])).toBe(0);
    });

    it('matches case-insensitively and returns count of distinct matching tokens', () => {
      const score = matchScore('Size XL Extra Large', ['xl', 'extra']);
      expect(score).toBe(2);
    });

    it('correctly scores single-character token matches', () => {
      expect(matchScore('s small', ['s'])).toBe(1);
      expect(matchScore('m medium', ['s'])).toBe(0);
    });
  });
});
