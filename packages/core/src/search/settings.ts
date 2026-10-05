import { MeilisearchApiError, type Settings } from 'meilisearch';
import { type SearchCtx, waitForTask } from './client';

/**
 * Vietnamese words are mostly 2–4 letters, below Meilisearch's default of 5 letters for one typo,
 * so a typo would almost never be forgiven. Words of 3 letters or fewer still need an exact match.
 */
const TYPO_TOLERANCE: Settings['typoTolerance'] = {
  minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
};

/** Searchable attributes in ranking order: a title match beats an author or synopsis match. */
export const STORY_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['title', 'authorName', 'synopsis'],
  filterableAttributes: [
    'tagSlugs',
    'mainTagSlug',
    'status',
    'wordCount',
    'isMature',
    'isAiAssisted',
    'authorUsername',
  ],
  sortableAttributes: ['lastChapterAt', 'wordCount', 'createdAt'],
  typoTolerance: TYPO_TOLERANCE,
};

export const AUTHOR_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['displayName', 'username'],
  sortableAttributes: ['storyCount'],
  typoTolerance: TYPO_TOLERANCE,
};

const INDEXES = [
  { key: 'stories', primaryKey: 'publicId', settings: STORY_INDEX_SETTINGS },
  { key: 'authors', primaryKey: 'username', settings: AUTHOR_INDEX_SETTINGS },
] as const;

/**
 * Creates both indexes if missing and applies their settings, waiting for every task. Idempotent:
 * Meilisearch leaves unchanged settings alone.
 */
export async function ensureSearchSettings(ctx: SearchCtx): Promise<void> {
  for (const { key, primaryKey, settings } of INDEXES) {
    const uid = ctx.names[key];
    try {
      await ctx.client.getIndex(uid);
    } catch (error) {
      if (!(error instanceof MeilisearchApiError) || error.cause?.code !== 'index_not_found') {
        throw error;
      }
      await waitForTask(ctx.client.createIndex(uid, { primaryKey }), `create ${uid}`);
    }
    await waitForTask(ctx.client.index(uid).updateSettings(settings), `settings ${uid}`);
  }
}
