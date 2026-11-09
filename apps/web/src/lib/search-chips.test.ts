import type { SearchQuery } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { aiChip, chipGroups, clearedSearch } from './search-chips';

const GENRES = [
  { slug: 'tien-hiep', name: 'Tiên hiệp' },
  { slug: 'do-thi', name: 'Đô thị' },
];
const blank: SearchQuery = { q: '', noAi: false, page: 1 };

const group = (query: SearchQuery, key: string) => {
  const found = chipGroups(query, GENRES).find((g) => g.key === key);
  if (!found) throw new Error(`no group ${key}`);
  return found;
};
const currentKeys = (query: SearchQuery, key: string) =>
  group(query, key)
    .chips.filter((c) => c.current)
    .map((c) => c.key);

describe('chipGroups', () => {
  it('marks exactly one chip current in every group of a plain query', () => {
    const query: SearchQuery = { ...blank, tag: 'do-thi', status: 'completed', maxWords: 49_999 };
    for (const g of chipGroups(query, GENRES)) {
      expect(
        g.chips.filter((c) => c.current),
        g.key,
      ).toHaveLength(1);
    }
    expect(currentKeys(query, 'tag')).toEqual(['do-thi']);
    expect(currentKeys(query, 'status')).toEqual(['completed']);
    expect(currentKeys(query, 'words')).toEqual(['short']);
    expect(currentKeys(blank, 'tag')).toEqual(['any']);
  });

  it('keeps the text and other filters, drops undefined fields and goes back to page 1', () => {
    const query: SearchQuery = { ...blank, q: 'kiếm', tag: 'do-thi', page: 3 };
    const completed = group(query, 'status').chips.find((c) => c.key === 'completed');
    expect(completed?.search).toEqual({
      q: 'kiếm',
      tag: 'do-thi',
      status: 'completed',
      noAi: false,
      page: 1,
    });
    const anyTag = group(query, 'tag').chips.find((c) => c.key === 'any');
    expect(anyTag?.search).toEqual({ q: 'kiếm', noAi: false, page: 1 });
    expect(Object.keys(anyTag?.search ?? {})).not.toContain('tag');
  });

  it('offers "most relevant" only with text, and makes it the default order then', () => {
    expect(group(blank, 'sort').chips.map((c) => c.key)).toEqual(['updated', 'newest', 'longest']);
    expect(currentKeys(blank, 'sort')).toEqual(['updated']);
    const text = { ...blank, q: 'kiếm' };
    expect(group(text, 'sort').chips.map((c) => c.key)).toEqual([
      'relevance',
      'updated',
      'newest',
      'longest',
    ]);
    expect(currentKeys(text, 'sort')).toEqual(['relevance']);
    expect(currentKeys({ ...text, sort: 'longest' }, 'sort')).toEqual(['longest']);
    expect(group(text, 'sort').chips[0]?.search).toEqual({ q: 'kiếm', noAi: false, page: 1 });
  });

  it('leads the default "recently updated" chip back to the page without an order when no text', () => {
    const updated = (query: SearchQuery) =>
      group(query, 'sort').chips.find((c) => c.key === 'updated')?.search;
    expect(updated({ ...blank, sort: 'updated' })).toEqual(blank);
    expect(updated({ ...blank, q: 'kiếm' })).toEqual({ ...blank, q: 'kiếm', sort: 'updated' });
  });

  it('gives a tag from the URL that is not a genre its own chip', () => {
    const chips = group({ ...blank, tag: 'xuyen-khong' }, 'tag').chips;
    expect(chips.map((c) => c.key)).toEqual(['any', 'tien-hiep', 'do-thi', 'xuyen-khong']);
    expect(chips.at(-1)).toMatchObject({ label: 'xuyen-khong', current: true });
  });

  it('marks no word chip current for a custom range, and picking one replaces it', () => {
    const query = { ...blank, minWords: 1_000, maxWords: 2_000 };
    expect(currentKeys(query, 'words')).toEqual([]);
    const any = group(query, 'words').chips.find((c) => c.key === 'any');
    expect(any?.search).toEqual(blank);
    const epic = group(query, 'words').chips.find((c) => c.key === 'epic');
    expect(epic?.search).toEqual({ ...blank, minWords: 500_000 });
  });
});

describe('aiChip and clearedSearch', () => {
  it('toggles the AI filter on the first page', () => {
    expect(aiChip({ ...blank, page: 2 })).toEqual({ on: false, search: { ...blank, noAi: true } });
    expect(aiChip({ ...blank, noAi: true })).toEqual({ on: true, search: blank });
  });

  it('clears every filter and the order, keeping the text', () => {
    const query: SearchQuery = { ...blank, q: 'a', tag: 'do-thi', noAi: true, sort: 'newest' };
    expect(clearedSearch(query)).toEqual({ q: 'a', noAi: false, page: 1 });
  });
});
