import type { Db } from '@novel-hub/db';
import { RANKING_RULES, type RankingPeriod, type RankingVariant } from '@novel-hub/shared';
import { and, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import {
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCards,
  storyCardColumns,
  toStoryCard,
} from '../catalog/story-card';
import { withTimeout } from '../lib/with-timeout';
import { rankingKey } from './ranking-keys';

/** Reads the rankings the worker wrote. */
export interface RankingReader {
  /** Story ids of a ranking, best first; `null` when the store is unavailable (never throws). */
  top(period: RankingPeriod, variant: RankingVariant, limit: number): Promise<string[] | null>;
}

/** Ranking reader on `redis` (the web passes its producer connection), bounded by `timeoutMs`. */
export function createRankingReader(
  redis: Redis,
  prefix: string,
  timeoutMs: number,
): RankingReader {
  // Logged once per outage, like the rate limiter: every page view would log it otherwise.
  let failing = false;
  return {
    async top(period, variant, limit) {
      try {
        const ids = await withTimeout(
          redis.zrange(rankingKey(prefix, period, variant), 0, limit - 1, 'REV'),
          timeoutMs,
          'rankings',
        );
        failing = false;
        return ids;
      } catch (error) {
        if (!failing) {
          failing = true;
          const reason = error instanceof Error ? error.message || error.name : String(error);
          console.error('[rankings] store unavailable:', reason);
        }
        return null;
      }
    },
  };
}

export interface RankingPage {
  stories: StoryCardDto[];
  /** `false` when the rankings could not be read: the empty list is an outage, not a fact. */
  available: boolean;
}

/**
 * A ranking as cards, in ranking order. Every story goes through `publicStoryWhere` again, so one
 * hidden or banned since the last recompute is left out right away. `reader` is `null` where
 * Redis is not wired (tests): the ranking is then unavailable.
 */
export async function readRanking(
  db: Db,
  reader: RankingReader | null,
  period: RankingPeriod,
  o: { includeMature: boolean; limit?: number },
): Promise<RankingPage> {
  const limit = o.limit ?? RANKING_RULES.pageSize;
  // The whole kept ranking, so stories hidden since the recompute leave no hole at the bottom.
  const ids = reader
    ? await reader.top(period, o.includeMature ? 'all' : 'general', RANKING_RULES.keep)
    : null;
  if (ids === null) return { stories: [], available: false };
  if (ids.length === 0) return { stories: [], available: true };
  const rows = await selectStoryCards(db).where(
    and(inArray(storyCardColumns.id, ids), publicStoryWhere(o)),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const stories = ids
    .map((id) => byId.get(id))
    .filter((r) => r !== undefined)
    .slice(0, limit)
    .map(toStoryCard);
  return { stories, available: true };
}
