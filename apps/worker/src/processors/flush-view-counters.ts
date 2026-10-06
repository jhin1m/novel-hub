import { type Db, flushStoryReaders, flushViewCounters } from '@novel-hub/core';
import { statsDate } from '@novel-hub/shared';
import type { Redis } from 'ioredis';

const DAY_MS = 86_400_000;

export interface FlushViewCountersDeps {
  db: Db;
  statsRedis: Redis;
  /** Same prefix the web counts reads under (`QUEUE_PREFIX`). */
  queuePrefix: string;
}

/**
 * Moves today's and yesterday's read counters (late reads around midnight) into Postgres: per
 * chapter (`chapter_daily_stats`) and the stories' daily readers (`story_daily_stats`). Both run
 * even when the other fails, so one stuck flush never lets the other's counters expire; the
 * first error is thrown afterwards.
 */
export async function processFlushViewCounters(
  deps: FlushViewCountersDeps,
  now: Date = new Date(),
): Promise<void> {
  const dates = [statsDate(new Date(now.getTime() - DAY_MS)), statsDate(now)];
  const [chapterFlush, storyFlush] = await Promise.allSettled([
    flushViewCounters(deps.statsRedis, deps.db, deps.queuePrefix, dates),
    flushStoryReaders(deps.statsRedis, deps.db, deps.queuePrefix, dates),
  ]);
  if (chapterFlush.status === 'fulfilled' && chapterFlush.value.chapters > 0) {
    console.info(`[views] flushed read counters of ${chapterFlush.value.chapters} chapters`);
  }
  if (storyFlush.status === 'fulfilled' && storyFlush.value.stories > 0) {
    console.info(`[views] flushed daily readers of ${storyFlush.value.stories} stories`);
  }
  for (const result of [chapterFlush, storyFlush]) {
    if (result.status === 'rejected') throw result.reason;
  }
}
