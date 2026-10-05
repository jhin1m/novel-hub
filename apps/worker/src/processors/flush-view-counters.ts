import { type Db, flushViewCounters } from '@novel-hub/core';
import { statsDate } from '@novel-hub/shared';
import type { Redis } from 'ioredis';

const DAY_MS = 86_400_000;

export interface FlushViewCountersDeps {
  db: Db;
  statsRedis: Redis;
  /** Same prefix the web counts reads under (`QUEUE_PREFIX`). */
  queuePrefix: string;
}

/** Moves today's and yesterday's read counters (late reads around midnight) into Postgres. */
export async function processFlushViewCounters(
  deps: FlushViewCountersDeps,
  now: Date = new Date(),
): Promise<void> {
  const dates = [statsDate(new Date(now.getTime() - DAY_MS)), statsDate(now)];
  const { chapters } = await flushViewCounters(deps.statsRedis, deps.db, deps.queuePrefix, dates);
  if (chapters > 0) console.info(`[views] flushed read counters of ${chapters} chapters`);
}
