import { describe, expect, it } from 'vitest';
import { diffRecords } from './diff';

describe('diffRecords', () => {
  it('reports only the field that actually changed, ignoring everything identical', () => {
    const before = { id: 'c1', name: { en: 'aaaa123' }, slug: 'aaaa', isActive: true };
    const after = { id: 'c1', name: { en: 'aaaa' }, slug: 'aaaa', isActive: true };

    expect(diffRecords(before, after)).toEqual([
      { path: 'name.en', before: 'aaaa123', after: 'aaaa' },
    ]);
  });

  it('excludes id and updatedAt even when they differ', () => {
    const before = { id: 'c1', updatedAt: '2026-09-15T00:00:00Z', slug: 'aaaa' };
    const after = { id: 'c1', updatedAt: '2026-09-16T00:00:00Z', slug: 'aaaa' };

    expect(diffRecords(before, after)).toEqual([]);
  });

  it('flattens nested objects into dot paths', () => {
    const before = { name: { en: 'Shoes', bn: 'জুতা' } };
    const after = { name: { en: 'Shoes', bn: 'জুতো' } };

    expect(diffRecords(before, after)).toEqual([
      { path: 'name.bn', before: 'জুতা', after: 'জুতো' },
    ]);
  });

  it('treats arrays as one unit, not per-index paths', () => {
    const before = { orderedIds: ['a', 'b', 'c'] };
    const after = { orderedIds: ['a', 'c', 'b'] };

    expect(diffRecords(before, after)).toEqual([
      { path: 'orderedIds', before: ['a', 'b', 'c'], after: ['a', 'c', 'b'] },
    ]);
  });

  it('an unchanged array of the same values in the same order produces no diff', () => {
    const before = { orderedIds: ['a', 'b'] };
    const after = { orderedIds: ['a', 'b'] };

    expect(diffRecords(before, after)).toEqual([]);
  });

  it('reports a field that only exists on one side (added/removed) with the other as undefined', () => {
    const before = { slug: 'aaaa' };
    const after = { slug: 'aaaa', brandRequirement: 'optional' };

    expect(diffRecords(before, after)).toEqual([
      { path: 'brandRequirement', before: undefined, after: 'optional' },
    ]);
  });

  it('distinguishes null from a genuinely missing field', () => {
    const before = { parentId: 'p1' };
    const after = { parentId: null };

    expect(diffRecords(before, after)).toEqual([{ path: 'parentId', before: 'p1', after: null }]);
  });

  it('two identical objects produce no diff at all', () => {
    const record = { id: 'c1', name: { en: 'Shoes' }, slug: 'shoes' };
    expect(diffRecords(record, { ...record })).toEqual([]);
  });

  it('returns no entries when either side is not a plain object (create/delete have nothing to diff against)', () => {
    expect(diffRecords(null, { slug: 'aaaa' })).toEqual([]);
    expect(diffRecords({ slug: 'aaaa' }, null)).toEqual([]);
    expect(diffRecords(null, null)).toEqual([]);
  });

  it('sorts entries alphabetically by path, regardless of key insertion order', () => {
    const before = { zebra: 1, apple: 1 };
    const after = { zebra: 2, apple: 2 };

    expect(diffRecords(before, after).map((e) => e.path)).toEqual(['apple', 'zebra']);
  });
});
