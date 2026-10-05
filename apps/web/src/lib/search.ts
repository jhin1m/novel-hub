import { type SearchQuery, WORD_RANGES, type WordRangeKey } from '@novel-hub/shared';

/** The query as URL parameters, in a fixed order and without defaults (empty text, page 1). */
export function searchParams(query: SearchQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.q !== '') params.q = query.q;
  if (query.tag !== undefined) params.tag = query.tag;
  if (query.status !== undefined) params.status = query.status;
  if (query.minWords !== undefined) params.minWords = String(query.minWords);
  if (query.maxWords !== undefined) params.maxWords = String(query.maxWords);
  if (query.page > 1) params.page = String(query.page);
  return params;
}

/** Link to the search page for `query` (pagination links are plain document links). */
export function searchHref(query: SearchQuery): string {
  const qs = new URLSearchParams(searchParams(query)).toString();
  return qs ? `/search?${qs}` : '/search';
}

/** The form's word range for a query; `undefined` when it matches none of the ranges. */
export function wordRangeOf(
  query: Pick<SearchQuery, 'minWords' | 'maxWords'>,
): WordRangeKey | undefined {
  return WORD_RANGES.find(
    (range) =>
      ('minWords' in range ? range.minWords : undefined) === query.minWords &&
      ('maxWords' in range ? range.maxWords : undefined) === query.maxWords,
  )?.key;
}

/** The `minWords`/`maxWords` of a range picked in the form (`undefined`: any length). */
export function wordBounds(
  key: WordRangeKey | undefined,
): Pick<SearchQuery, 'minWords' | 'maxWords'> {
  const range = WORD_RANGES.find((r) => r.key === key);
  return {
    minWords: range && 'minWords' in range ? range.minWords : undefined,
    maxWords: range && 'maxWords' in range ? range.maxWords : undefined,
  };
}

/** The query in the shape the typed API client sends (every value a string, defaults included). */
export function apiSearchQuery(query: SearchQuery) {
  return {
    q: query.q,
    page: String(query.page),
    ...(query.tag !== undefined && { tag: query.tag }),
    ...(query.status !== undefined && { status: query.status }),
    ...(query.minWords !== undefined && { minWords: String(query.minWords) }),
    ...(query.maxWords !== undefined && { maxWords: String(query.maxWords) }),
  };
}
