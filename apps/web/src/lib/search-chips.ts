import {
  STORY_STATUSES,
  SEARCH_SORTS,
  type SearchQuery,
  type SearchSort,
  WORD_RANGES,
  type WordRangeKey,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { STORY_STATUS_LABELS } from '../components/story/story-labels';
import { withFilters, wordBounds, wordRangeOf } from './search';

/*
 * One-tap filter and order chips of the explore page, as plain data: the component only maps them
 * to links, so the choice of the current chip is tested here without a DOM or a router.
 */

export interface SearchChip {
  key: string;
  label: string;
  /** Where the chip leads: the current query with this choice, back on the first page. */
  search: SearchQuery;
  current: boolean;
}

export interface SearchChipGroup {
  key: 'sort' | 'tag' | 'status' | 'words';
  label: string;
  chips: SearchChip[];
}

const WORD_RANGE_LABELS: Record<WordRangeKey, () => string> = {
  short: m.search_words_short,
  medium: m.search_words_medium,
  long: m.search_words_long,
  epic: m.search_words_epic,
};

const SORT_LABELS: Record<SearchSort, () => string> = {
  updated: m.search_sort_updated,
  newest: m.search_sort_newest,
  longest: m.search_sort_longest,
};

/** The query without its `undefined` fields, so a chip's search matches the parsed URL exactly. */
function compact(query: SearchQuery): SearchQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ) as SearchQuery;
}

function chip(
  query: SearchQuery,
  key: string,
  label: string,
  patch: Partial<SearchQuery>,
  current: boolean,
): SearchChip {
  return { key, label, search: compact(withFilters(query, patch)), current };
}

/**
 * The order chips: "most relevant" only with text (an empty text has no relevance). The current
 * one is the explicit order, else the default: relevance with text, most recently updated without.
 */
function sortGroup(query: SearchQuery): SearchChipGroup {
  const shown = query.sort ?? (query.q === '' ? 'updated' : undefined);
  const chips = SEARCH_SORTS.map((sort) =>
    // Without text, "most recently updated" is the default: its chip leads to the page without an
    // explicit order, so on the bare page it is a no-op that keeps the entry rows.
    chip(
      query,
      sort,
      SORT_LABELS[sort](),
      { sort: query.q === '' && sort === 'updated' ? undefined : sort },
      shown === sort,
    ),
  );
  if (query.q !== '') {
    chips.unshift(
      chip(query, 'relevance', m.search_sort_relevance(), { sort: undefined }, shown === undefined),
    );
  }
  return { key: 'sort', label: m.search_sort_label(), chips };
}

/** Genre chips; a tag from a link that is not a genre (a theme, say) gets its own chip. */
function tagGroup(query: SearchQuery, genres: { slug: string; name: string }[]): SearchChipGroup {
  const items = genres.map((genre) => ({ slug: genre.slug, name: genre.name }));
  if (query.tag !== undefined && !items.some((item) => item.slug === query.tag)) {
    items.push({ slug: query.tag, name: query.tag });
  }
  return {
    key: 'tag',
    label: m.search_tag_label(),
    chips: [
      chip(query, 'any', m.search_any(), { tag: undefined }, query.tag === undefined),
      ...items.map((item) =>
        chip(query, item.slug, item.name, { tag: item.slug }, query.tag === item.slug),
      ),
    ],
  };
}

function statusGroup(query: SearchQuery): SearchChipGroup {
  return {
    key: 'status',
    label: m.story_status_label(),
    chips: [
      chip(query, 'any', m.search_any(), { status: undefined }, query.status === undefined),
      ...STORY_STATUSES.map((status) =>
        chip(query, status, STORY_STATUS_LABELS[status](), { status }, query.status === status),
      ),
    ],
  };
}

/** Word-count chips; a custom range from the URL matches none, so no chip is current. */
function wordsGroup(query: SearchQuery): SearchChipGroup {
  const range = wordRangeOf(query);
  const custom = range === undefined && (query.minWords ?? query.maxWords) !== undefined;
  return {
    key: 'words',
    label: m.search_words_label(),
    chips: [
      chip(query, 'any', m.search_any(), wordBounds(undefined), range === undefined && !custom),
      ...WORD_RANGES.map(({ key }) =>
        chip(query, key, WORD_RANGE_LABELS[key](), wordBounds(key), range === key),
      ),
    ],
  };
}

/** Every chip group, in display order: order first, then the filters. */
export function chipGroups(
  query: SearchQuery,
  genres: { slug: string; name: string }[],
): SearchChipGroup[] {
  return [sortGroup(query), tagGroup(query, genres), statusGroup(query), wordsGroup(query)];
}

/** The "hide AI-assisted stories" switch: where it leads and whether it is on. */
export function aiChip(query: SearchQuery): { search: SearchQuery; on: boolean } {
  return { search: compact(withFilters(query, { noAi: !query.noAi })), on: query.noAi };
}

/** Where "clear filters" leads: the same text, every filter and the order dropped. */
export function clearedSearch(query: SearchQuery): SearchQuery {
  return compact({ q: query.q, noAi: false, page: 1 });
}
