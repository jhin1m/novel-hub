import { type Db, recomputeAllRankings } from '@novel-hub/core';
import type { Redis } from 'ioredis';

export interface RecomputeRankingsDeps {
  db: Db;
  statsRedis: Redis;
  /** Same prefix the web reads the rankings under (`QUEUE_PREFIX`). */
  queuePrefix: string;
}

/** Rewrites every ranking in Redis from `story_daily_stats`. */
export async function processRecomputeRankings(
  deps: RecomputeRankingsDeps,
  now: Date = new Date(),
): Promise<void> {
  const { entries } = await recomputeAllRankings(deps.db, deps.statsRedis, deps.queuePrefix, now);
  console.info(`[rankings] recomputed (${entries} entries)`);
}
