import { createWorkerConnection, recomputeAllRankings } from '@novel-hub/core';
import { createTestDb } from '@novel-hub/db/testing';
import { statsDate } from '@novel-hub/shared';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { E2E_QUEUE_PREFIX } from './search';

/**
 * Gives each story `readers` distinct readers today (as the worker's flush would have written
 * them), then recomputes every ranking the way the worker's `recompute-rankings` job does (e2e
 * runs no worker). Rankings only ever hold stories with stats, so other specs' stories stay out.
 */
export async function rankStories(readers: readonly { publicId: string; readers: number }[]) {
  const now = new Date();
  const { db, pool } = createTestDb();
  const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
  const redis = createWorkerConnection(TEST_REDIS_URL);
  try {
    for (const r of readers) {
      await pool.query(
        `insert into story_daily_stats (story_id, date, unique_readers)
         select id, $2::date, $3 from stories where public_id = $1
         on conflict (story_id, date) do update set unique_readers = excluded.unique_readers`,
        [r.publicId, statsDate(now), r.readers],
      );
    }
    await recomputeAllRankings(db, redis, E2E_QUEUE_PREFIX, now);
  } finally {
    redis.disconnect();
    await pool.end();
  }
}
