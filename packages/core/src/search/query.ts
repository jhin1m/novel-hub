import type { Db } from '@novel-hub/db';
import {
  SEARCH_AUTHOR_LIMIT,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  type SearchQuery,
} from '@novel-hub/shared';
import type { MultiSearchQuery } from 'meilisearch';
import type { ListOptions, StoryCardDto } from '../catalog/story-card';
import { canonicalTagSlug } from '../catalog/tag-page';
import type { SearchCtx } from './client';
import { type AuthorDoc, type StoryDoc, storyDocToCard } from './documents';

export type AuthorHit = AuthorDoc;

export interface SearchResult {
  stories: { hits: StoryCardDto[]; page: number; totalPages: number; totalHits: number };
  /** Matching authors; only for a text search, on its first page. */
  authors: AuthorHit[];
}

/**
 * Meilisearch filter for a query, as an array (ANDed) of expressions. Every value comes from
 * `searchQuerySchema` (a bare slug, an enum, integers), so nothing typed by a user is spliced in
 * as free text. 18+ stories are left out unless the server decided the reader allowed them.
 */
export function buildStoryFilter(
  q: Pick<SearchQuery, 'tag' | 'status' | 'minWords' | 'maxWords'>,
  o: ListOptions,
): string[] {
  const filter: string[] = [];
  if (!o.includeMature) filter.push('isMature = false');
  if (q.tag !== undefined) filter.push(`tagSlugs = "${q.tag}"`);
  if (q.status !== undefined) filter.push(`status = "${q.status}"`);
  if (q.minWords !== undefined) filter.push(`wordCount >= ${q.minWords}`);
  if (q.maxWords !== undefined) filter.push(`wordCount <= ${q.maxWords}`);
  return filter;
}

/**
 * Stories (and, for a text search, authors) matching `query`, in one `multiSearch` request. An
 * empty text browses the filtered stories, most recently updated first. Throws when Meilisearch
 * fails or times out; the caller answers 503.
 */
export async function searchCatalog(
  db: Db,
  ctx: SearchCtx,
  query: SearchQuery,
  o: ListOptions,
): Promise<SearchResult> {
  // A merged tag filters as the tag it was merged into (docs only carry canonical slugs).
  const tag =
    query.tag === undefined ? undefined : ((await canonicalTagSlug(db, query.tag)) ?? query.tag);
  const withAuthors = query.q !== '' && query.page === 1;
  const queries: MultiSearchQuery[] = [
    {
      indexUid: ctx.names.stories,
      q: query.q,
      filter: buildStoryFilter({ ...query, tag }, o),
      page: query.page,
      hitsPerPage: SEARCH_PAGE_SIZE,
      ...(query.q === '' && { sort: ['lastChapterAt:desc'] }),
    },
  ];
  if (withAuthors) {
    queries.push({ indexUid: ctx.names.authors, q: query.q, limit: SEARCH_AUTHOR_LIMIT });
  }
  const { results } = await ctx.client.multiSearch({ queries });
  const [storyResult, authorResult] = results;
  if (!storyResult) throw new Error('Meilisearch returned no story results');
  return {
    stories: {
      hits: (storyResult.hits as unknown as StoryDoc[]).map(storyDocToCard),
      page: query.page,
      totalPages: Math.min(SEARCH_MAX_PAGE, Math.max(1, storyResult.totalPages ?? 1)),
      totalHits: storyResult.totalHits ?? storyResult.estimatedTotalHits ?? 0,
    },
    authors: withAuthors
      ? ((authorResult?.hits ?? []) as unknown as AuthorDoc[]).map(toAuthorHit)
      : [],
  };
}

/** Only the doc fields, whatever else Meilisearch adds to a hit. */
function toAuthorHit(doc: AuthorDoc): AuthorHit {
  return {
    username: doc.username,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    storyCount: doc.storyCount,
  };
}
