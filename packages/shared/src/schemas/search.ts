import { z } from 'zod';
import { STORY_STATUSES } from './story';

/** Stories per page of search results. */
export const SEARCH_PAGE_SIZE = 20;

/** Matching authors shown above the stories (first page of a text search only). */
export const SEARCH_AUTHOR_LIMIT = 5;

/** Deepest result page served; past it a reader should narrow the search instead. */
export const SEARCH_MAX_PAGE = 50;

/** Longest query accepted; longer input is dropped rather than rejected. */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Word-count ranges offered by the search form; each maps to the `minWords`/`maxWords` query. */
export const WORD_RANGES = [
  { key: 'short', maxWords: 49_999 },
  { key: 'medium', minWords: 50_000, maxWords: 199_999 },
  { key: 'long', minWords: 200_000, maxWords: 499_999 },
  { key: 'epic', minWords: 500_000 },
] as const satisfies readonly { key: string; minWords?: number; maxWords?: number }[];

export type WordRangeKey = (typeof WORD_RANGES)[number]['key'];

/**
 * The router parses query values as JSON, so `?q=1984` arrives as a number; turn it back into the
 * text the reader typed instead of dropping it.
 */
const asText = (value: unknown) =>
  typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;

const wordBound = z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined);

/**
 * Query of `/search` and `GET /api/v1/search`. Every field falls back instead of failing, so a
 * hand-edited URL still shows a page. Values reach the Meilisearch filter only through this
 * schema: the tag is a bare slug and the status an enum, never free text.
 */
export const searchQuerySchema = z.object({
  q: z.preprocess(asText, z.string().trim().max(SEARCH_QUERY_MAX_LENGTH)).catch(''),
  tag: z
    .preprocess(
      asText,
      z
        .string()
        .regex(/^[a-z0-9-]{1,80}$/)
        .optional(),
    )
    .catch(undefined),
  status: z.enum(STORY_STATUSES).optional().catch(undefined),
  minWords: wordBound,
  maxWords: wordBound,
  page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).catch(1),
});

export type SearchQuery = z.output<typeof searchQuerySchema>;

/** Payload of the `search-sync` job: which story, or which user's author doc and stories, to resync. */
export const searchSyncPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('story'), storyId: z.uuid() }),
  z.object({ kind: z.literal('user'), userId: z.uuid() }),
]);

export type SearchSyncPayload = z.infer<typeof searchSyncPayload>;
