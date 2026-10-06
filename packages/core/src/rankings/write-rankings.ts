import type { RankingPeriod, RankingVariant } from '@novel-hub/shared';
import type { Redis } from 'ioredis';
import { rankingKey } from './ranking-keys';

/** A ranking outlives a stopped worker by this long, then disappears instead of going stale (s). */
const RANKING_TTL_SEC = 2 * 86_400;

/**
 * Replaces a ranking in one transaction: built under a temporary key, then renamed over the live
 * one, so readers see the old or the new ranking, never half of one. The score is the position
 * (first = highest), which keeps the computed order, tie-breaks included. An empty result deletes
 * the ranking, so stories that no longer qualify do not stay on it.
 */
export async function writeRankings(
  redis: Redis,
  prefix: string,
  period: RankingPeriod,
  variant: RankingVariant,
  storyIds: readonly string[],
): Promise<void> {
  const live = rankingKey(prefix, period, variant);
  if (storyIds.length === 0) {
    await redis.del(live);
    return;
  }
  const tmp = `${live}:tmp`;
  const members = storyIds.flatMap((id, i) => [storyIds.length - i, id] as const);
  const replies = await redis
    .multi()
    .del(tmp)
    .zadd(tmp, ...members)
    .expire(tmp, RANKING_TTL_SEC)
    .rename(tmp, live)
    .exec();
  const failure = replies?.find(([error]) => error)?.[0];
  if (failure) throw failure;
}
