import { describe, expect, it } from 'vitest';
import { WORD_RANGES, searchQuerySchema, searchSyncPayload } from './search';

describe('searchQuerySchema', () => {
  it('parses a full query, trimming the text and coercing numbers', () => {
    expect(
      searchQuerySchema.parse({
        q: '  kiếm đạo ',
        tag: 'tien-hiep',
        status: 'completed',
        minWords: '50000',
        maxWords: 199999,
        page: '3',
      }),
    ).toEqual({
      q: 'kiếm đạo',
      tag: 'tien-hiep',
      status: 'completed',
      minWords: 50_000,
      maxWords: 199_999,
      page: 3,
    });
  });

  it('keeps a numeric query the router parsed as a number', () => {
    expect(searchQuerySchema.parse({ q: 1984, tag: 2024 })).toEqual({
      q: '1984',
      tag: '2024',
      page: 1,
    });
    expect(searchQuerySchema.parse({ q: true }).q).toBe('true');
  });

  it('fills defaults for an empty query', () => {
    expect(searchQuerySchema.parse({})).toEqual({ q: '', page: 1 });
  });

  it.each([
    ['a tag with a quote', { tag: 'x" OR isMature = true' }, { tag: undefined }],
    ['a tag with uppercase', { tag: 'Tien-Hiep' }, { tag: undefined }],
    ['an unknown status', { status: 'xyz' }, { status: undefined }],
    ['a page that is not a number', { page: 'abc' }, { page: 1 }],
    ['a page past the limit', { page: 51 }, { page: 1 }],
    ['negative words', { minWords: -1 }, { minWords: undefined }],
    ['fractional words', { maxWords: '1.5' }, { maxWords: undefined }],
    ['a query over 100 characters', { q: 'a'.repeat(101) }, { q: '' }],
  ])('drops %s instead of failing', (_label, input, expected) => {
    expect(searchQuerySchema.parse(input)).toMatchObject(expected);
  });

  it('offers ranges that do not overlap', () => {
    for (let i = 1; i < WORD_RANGES.length; i += 1) {
      const prev = WORD_RANGES[i - 1];
      const next = WORD_RANGES[i];
      expect(prev && 'maxWords' in prev ? prev.maxWords + 1 : NaN).toBe(
        next && 'minWords' in next ? next.minWords : NaN,
      );
    }
  });
});

describe('searchSyncPayload', () => {
  const id = '0192f0c4-6a1b-7c2d-8e3f-4a5b6c7d8e9f';

  it('accepts a story or a user', () => {
    expect(searchSyncPayload.parse({ kind: 'story', storyId: id })).toEqual({
      kind: 'story',
      storyId: id,
    });
    expect(searchSyncPayload.parse({ kind: 'user', userId: id }).kind).toBe('user');
  });

  it('rejects a payload without a uuid', () => {
    expect(searchSyncPayload.safeParse({ kind: 'story', storyId: 'abc' }).success).toBe(false);
    expect(searchSyncPayload.safeParse({ kind: 'tag', tagId: id }).success).toBe(false);
  });
});
