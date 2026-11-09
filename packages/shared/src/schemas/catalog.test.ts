import { describe, expect, it } from 'vitest';
import { canonicalPath } from '../canonical-path';
import { canonicalPageParam, storyListQuery } from './catalog';

describe('canonicalPageParam', () => {
  it.each([
    [[], 1],
    [['1'], 1],
    [['2'], 2],
    [['02'], 2],
    [['abc'], 1],
    [['0'], 1],
    [['-3'], 1],
    [['2.5'], 1],
    [['1001'], 1001],
    [['3', '5'], 3],
    [['999999999999'], 1],
  ] as const)('%j → page %i', (raw, page) => {
    expect(canonicalPageParam(raw)).toBe(page);
  });

  it('builds the canonical URL that the route redirects to', () => {
    const path = (raw: string[]) =>
      canonicalPath({ kind: 'tag', slug: 'tien-hiep', page: canonicalPageParam(raw) });
    expect(path(['1'])).toBe('/tags/tien-hiep');
    expect(path(['02'])).toBe('/tags/tien-hiep?page=2');
    expect(path(['abc'])).toBe('/tags/tien-hiep');
  });
});

describe('storyListQuery', () => {
  it('accepts every list and parses the page', () => {
    expect(storyListQuery.parse({ list: 'recent', page: '3' })).toEqual({
      list: 'recent',
      page: 3,
    });
    expect(storyListQuery.parse({ list: 'notable' })).toEqual({ list: 'notable' });
    expect(storyListQuery.parse({ list: 'completed' })).toEqual({ list: 'completed' });
    expect(storyListQuery.parse({ list: 'tag', tag: 'tien-hiep' })).toEqual({
      list: 'tag',
      tag: 'tien-hiep',
      noAi: false,
    });
    expect(storyListQuery.parse({ list: 'author', author: 'lam_phong' })).toEqual({
      list: 'author',
      author: 'lam_phong',
    });
    expect(storyListQuery.parse({ list: 'ranking', period: 'rising' })).toEqual({
      list: 'ranking',
      period: 'rising',
    });
  });

  it('reads the tag list AI filter from its query string form only', () => {
    expect(storyListQuery.parse({ list: 'tag', tag: 'tien-hiep', noAi: '1', page: '2' })).toEqual({
      list: 'tag',
      tag: 'tien-hiep',
      page: 2,
      noAi: true,
    });
    expect(storyListQuery.safeParse({ list: 'tag', tag: 'tien-hiep', noAi: 'true' }).success).toBe(
      false,
    );
    expect(storyListQuery.parse({ list: 'tag', tag: 'tien-hiep', noAi: '0' })).toMatchObject({
      noAi: false,
    });
  });

  it('rejects malformed pages, slugs and usernames', () => {
    expect(storyListQuery.safeParse({ list: 'recent', page: '0' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'recent', page: '02' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'tag', tag: 'Tien Hiep' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'author', author: 'AB' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'popular' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'ranking', period: 'year' }).success).toBe(false);
    expect(storyListQuery.safeParse({ list: 'ranking' }).success).toBe(false);
  });

  it('drops an includeMature flag sent by the client', () => {
    expect(storyListQuery.parse({ list: 'notable', includeMature: 'true' })).toEqual({
      list: 'notable',
    });
  });
});
