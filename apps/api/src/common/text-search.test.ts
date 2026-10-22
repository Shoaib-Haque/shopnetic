import { describe, expect, it } from 'vitest';
import {
  buildTokenSearch,
  rankedNextCursor,
  rankedOffsetFromCursor,
  tokenizeForSql,
} from './text-search.js';

describe('text-search', () => {
  describe('tokenizeForSql', () => {
    it('normalizes queries and enforces >= 2 char and <= 10 token limits', () => {
      expect(tokenizeForSql('  FX   Volume   Product   21!  ')).toEqual([
        'fx',
        'volume',
        'product',
        '21',
      ]);
      expect(tokenizeForSql("Men's T-Shirt & Jeans")).toEqual(['mens', 'shirt', 'jeans']);
      expect(tokenizeForSql('a b c 1 2 34')).toEqual(['34']);

      // Max 10 unique tokens
      const longQuery = 'one two three four five six seven eight nine ten eleven twelve';
      const tokens = tokenizeForSql(longQuery);
      expect(tokens).toHaveLength(10);
      expect(tokens).toEqual([
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine',
        'ten',
      ]);
    });
  });

  describe('buildTokenSearch', () => {
    it('handles empty token list gracefully', () => {
      const params: unknown[] = [];
      const res = buildTokenSearch([], 'haystack', params);
      expect(res.whereSql).toBe('1=1');
      expect(res.scoreSql).toBe('0');
      expect(params).toHaveLength(0);
    });

    it('builds single token search without primarySql', () => {
      const params: unknown[] = ['existing-param'];
      const res = buildTokenSearch(['cotton'], 'lower(name)', params);

      expect(res.whereSql).toBe('((lower(name) LIKE $2))');
      expect(res.scoreSql).toBe('(lower(name) LIKE $2)::int');
      expect(params).toEqual(['existing-param', '%cotton%']);
    });

    it('builds multi-token search with phrase and all-token boost', () => {
      const params: unknown[] = [];
      const res = buildTokenSearch(['cotton', 'tee'], 'haystack', params);

      expect(res.whereSql).toBe('((haystack LIKE $1) OR (haystack LIKE $2))');
      // Contains token 1, token 2, all-tokens match (* 5), and full phrase (* 10)
      expect(res.scoreSql).toContain('(haystack LIKE $1)::int + (haystack LIKE $2)::int');
      expect(res.scoreSql).toContain('(((haystack LIKE $1) AND (haystack LIKE $2))::int * 5)');
      expect(res.scoreSql).toContain('((haystack LIKE $3)::int * 10)');
      expect(params).toEqual(['%cotton%', '%tee%', '%cotton tee%']);
    });

    it('builds multi-tier weighted search when primarySql is provided', () => {
      const params: unknown[] = [];
      const res = buildTokenSearch(['fx', 'vol', '21'], 'lower(title || slug)', params, {
        primarySql: 'lower(title)',
      });

      // Where clause filters candidates matching any token in the broad haystack
      expect(res.whereSql).toBe(
        '((lower(title || slug) LIKE $1) OR (lower(title || slug) LIKE $2) OR (lower(title || slug) LIKE $3))',
      );

      // Score includes:
      // 1. Haystack base tokens ($1, $2, $3)
      expect(res.scoreSql).toContain('(lower(title || slug) LIKE $1)::int');
      expect(res.scoreSql).toContain('(lower(title || slug) LIKE $2)::int');
      expect(res.scoreSql).toContain('(lower(title || slug) LIKE $3)::int');

      // 2. Multi-token all-tokens bonus
      expect(res.scoreSql).toContain(
        '(((lower(title || slug) LIKE $1) AND (lower(title || slug) LIKE $2) AND (lower(title || slug) LIKE $3))::int * 5)',
      );

      // 3. Haystack full phrase ($4)
      expect(res.scoreSql).toContain('((lower(title || slug) LIKE $4)::int * 10)');

      // 4. PrimarySql per-token boost ($1, $2, $3 with * 2)
      expect(res.scoreSql).toContain('((lower(title) LIKE $1)::int * 2)');
      expect(res.scoreSql).toContain('((lower(title) LIKE $2)::int * 2)');
      expect(res.scoreSql).toContain('((lower(title) LIKE $3)::int * 2)');

      // 5. PrimarySql full phrase boost ($4 with * 10)
      expect(res.scoreSql).toContain('((lower(title) LIKE $4)::int * 10)');

      // 6. PrimarySql prefix match ($5 with * 10)
      expect(res.scoreSql).toContain('((lower(title) LIKE $5)::int * 10)');

      // 7. PrimarySql exact match ($6 with * 20)
      expect(res.scoreSql).toContain('((lower(title) = $6)::int * 20)');

      expect(params).toEqual(['%fx%', '%vol%', '%21%', '%fx vol 21%', 'fx vol 21%', 'fx vol 21']);
    });
  });

  describe('cursor helpers', () => {
    it('rankedOffsetFromCursor parses numeric offset safely', () => {
      expect(rankedOffsetFromCursor(undefined)).toBe(0);
      expect(rankedOffsetFromCursor('')).toBe(0);
      expect(rankedOffsetFromCursor('invalid')).toBe(0);
      expect(rankedOffsetFromCursor('-10')).toBe(0);
      expect(rankedOffsetFromCursor('25')).toBe(25);
    });

    it('rankedNextCursor returns next offset string when there are more rows', () => {
      expect(rankedNextCursor(26, 25, 0)).toBe('25');
      expect(rankedNextCursor(25, 25, 0)).toBeUndefined();
      expect(rankedNextCursor(20, 25, 50)).toBeUndefined();
    });
  });
});
