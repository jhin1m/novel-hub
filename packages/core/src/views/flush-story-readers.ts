import type { Db } from '@novel-hub/db';
import { VIEW_RULES } from '@novel-hub/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { viewKeys } from './view-keys';

const BATCH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Moves the daily reader count of every story marked since the last run into `story_daily_stats`
 * (PFCOUNT of the story's HyperLogLog, which stays until it expires; the larger count is kept, so
 * running twice changes nothing). When a step fails the stories are marked again before throwing,
 * so the next run retries them. Stories deleted since are skipped.
 */
export async function flushStoryReaders(
  redis: Redis,
  db: Db,
  prefix: string,
  dates: readonly string[],
): Promise<{ stories: number }> {
  let flushed = 0;
  for (const date of dates) {
    const keys = viewKeys(prefix, date);
    for (;;) {
      const ids = (await redis.spop(keys.storyDirty, BATCH)).filter((id) => UUID.test(id));
      if (ids.length === 0) break;
      try {
        const pipeline = redis.pipeline();
        for (const id of ids) pipeline.pfcount(keys.storyReaders(id));
        const replies = (await pipeline.exec()) ?? [];
        const counts = ids.map((storyId, i) => {
          const [error, count] = replies[i] ?? [];
          if (error) throw error;
          return { storyId, readers: Number(count ?? 0) };
        });
        await writeStoryStats(db, date, counts);
      } catch (error) {
        await redis
          .pipeline()
          .sadd(keys.storyDirty, ...ids)
          .expire(keys.storyDirty, VIEW_RULES.keyTtlSec)
          .exec()
          .catch(() => {});
        throw error;
      }
      flushed += ids.length;
    }
  }
  return { stories: flushed };
}

async function writeStoryStats(
  db: Db,
  date: string,
  counts: readonly { storyId: string; readers: number }[],
): Promise<void> {
  const rows: SQL[] = counts.map(
    (c) => sql`(${c.storyId}::uuid, ${date}::date, ${c.readers}::int)`,
  );
  await db.execute(sql`
    insert into story_daily_stats (story_id, date, unique_readers)
    select v.story_id, v.date, v.unique_readers
    from (values ${sql.join(rows, sql`, `)}) as v(story_id, date, unique_readers)
    join stories s on s.id = v.story_id
    on conflict (story_id, date) do update set
      unique_readers = greatest(story_daily_stats.unique_readers, excluded.unique_readers)
  `);
}
