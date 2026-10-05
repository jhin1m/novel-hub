import { describe, expect, it } from 'vitest';
import { searchHref, searchParams, wordBounds, wordRangeOf } from './search';

describe('search URL helpers', () => {
  it('leaves defaults out and keeps a fixed order', () => {
    expect(searchHref({ q: '', page: 1 })).toBe('/search');
    expect(
      searchHref({
        page: 2,
        maxWords: 199_999,
        minWords: 50_000,
        status: 'completed',
        tag: 'tien-hiep',
        q: 'kiếm đạo',
      }),
    ).toBe(
      '/search?q=ki%E1%BA%BFm+%C4%91%E1%BA%A1o&tag=tien-hiep&status=completed&minWords=50000&maxWords=199999&page=2',
    );
    expect(searchParams({ q: 'a', page: 1 })).toEqual({ q: 'a' });
  });

  it('maps word ranges both ways', () => {
    expect(wordBounds('medium')).toEqual({ minWords: 50_000, maxWords: 199_999 });
    expect(wordBounds('short')).toEqual({ minWords: undefined, maxWords: 49_999 });
    expect(wordBounds(undefined)).toEqual({ minWords: undefined, maxWords: undefined });
    expect(wordRangeOf(wordBounds('epic'))).toBe('epic');
    expect(wordRangeOf({ minWords: 1, maxWords: 2 })).toBeUndefined();
    expect(wordRangeOf({})).toBeUndefined();
  });
});
