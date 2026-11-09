import { describe, expect, it } from 'vitest';
import {
  apiSearchQuery,
  hasFilters,
  isUnfiltered,
  searchHref,
  searchParams,
  withFilters,
  wordBounds,
  wordRangeOf,
} from './search';

describe('search URL helpers', () => {
  it('leaves defaults out and keeps a fixed order', () => {
    expect(searchHref({ q: '', noAi: false, page: 1 })).toBe('/search');
    expect(
      searchHref({
        page: 2,
        noAi: true,
        maxWords: 199_999,
        minWords: 50_000,
        status: 'completed',
        tag: 'tien-hiep',
        q: 'kiếm đạo',
      }),
    ).toBe(
      '/search?q=ki%E1%BA%BFm+%C4%91%E1%BA%A1o&tag=tien-hiep&status=completed&minWords=50000&maxWords=199999&noAi=1&page=2',
    );
    expect(searchParams({ q: 'a', noAi: false, page: 1 })).toEqual({ q: 'a' });
  });

  it('keeps the AI filter on every page and in the API query', () => {
    const query = { q: '', noAi: true, page: 3 };
    expect(searchHref(query)).toBe('/search?noAi=1&page=3');
    expect(apiSearchQuery(query)).toEqual({ q: '', page: '3', noAi: '1' });
    expect(apiSearchQuery({ ...query, noAi: false })).toEqual({ q: '', page: '3', noAi: '0' });
  });

  it('maps word ranges both ways', () => {
    expect(wordBounds('medium')).toEqual({ minWords: 50_000, maxWords: 199_999 });
    expect(wordBounds('short')).toEqual({ minWords: undefined, maxWords: 49_999 });
    expect(wordBounds(undefined)).toEqual({ minWords: undefined, maxWords: undefined });
    expect(wordRangeOf(wordBounds('epic'))).toBe('epic');
    expect(wordRangeOf({ minWords: 1, maxWords: 2 })).toBeUndefined();
    expect(wordRangeOf({})).toBeUndefined();
  });

  it('keeps the order in the URL and the API query', () => {
    const query = { q: 'kiếm', noAi: false, page: 2, sort: 'longest' } as const;
    expect(searchHref(query)).toBe('/search?q=ki%E1%BA%BFm&sort=longest&page=2');
    expect(apiSearchQuery(query)).toEqual({ q: 'kiếm', page: '2', noAi: '0', sort: 'longest' });
    expect(apiSearchQuery({ ...query, sort: undefined })).not.toHaveProperty('sort');
  });
});

describe('explore state', () => {
  const blank = { q: '', noAi: false, page: 1 };

  it('is unfiltered only with no text, filter, order or later page', () => {
    expect(isUnfiltered(blank)).toBe(true);
    for (const patch of [
      { q: 'a' },
      { tag: 'tien-hiep' },
      { status: 'completed' as const },
      { minWords: 0 },
      { maxWords: 10 },
      { noAi: true },
      { sort: 'updated' as const },
      { page: 2 },
    ]) {
      expect(isUnfiltered({ ...blank, ...patch }), JSON.stringify(patch)).toBe(false);
    }
  });

  it('counts only the filters, not the text, order or page', () => {
    expect(hasFilters({ ...blank, q: 'a', sort: 'newest', page: 3 })).toBe(false);
    expect(hasFilters({ ...blank, noAi: true })).toBe(true);
    expect(hasFilters({ ...blank, maxWords: 49_999 })).toBe(true);
  });

  it('applies a patch back on the first page, keeping the rest', () => {
    expect(
      withFilters({ ...blank, q: 'a', tag: 'do-thi', page: 4 }, { status: 'completed' }),
    ).toEqual({ ...blank, q: 'a', tag: 'do-thi', status: 'completed', page: 1 });
  });
});
