import type { Db } from '@novel-hub/db';
import { RANKING_PERIODS, RANKING_VARIANTS, statsDate } from '@novel-hub/shared';
import type { Redis } from 'ioredis';
import { computeRankings } from './compute-rankings';
import { writeRankings } from './write-rankings';

/** Recomputes every ranking (each period, with and without 18+ stories) as of `now`. */
export async function recomputeAllRankings(
  db: Db,
  redis: Redis,
  prefix: string,
  now: Date,
): Promise<{ rankings: number; entries: number }> {
  const today = statsDate(now);
  let entries = 0;
  for (const period of RANKING_PERIODS) {
    for (const variant of RANKING_VARIANTS) {
      const ids = await computeRankings(db, period, today, { includeMature: variant === 'all' });
      await writeRankings(redis, prefix, period, variant, ids);
      entries += ids.length;
    }
  }
  return { rankings: RANKING_PERIODS.length * RANKING_VARIANTS.length, entries };
}
