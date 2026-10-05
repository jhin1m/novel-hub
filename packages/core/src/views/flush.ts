import type { Db } from '@novel-hub/db';
import { VIEW_RULES } from '@novel-hub/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { viewKeys } from './view-keys';

const BATCH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Pending {
  chapterId: string;
  views: number;
  uniqueReaders: number;
}

/**
 * Moves the Redis view counters of `dates` into `chapter_daily_stats`. Per batch of dirty
 * chapters: take the unflushed views (GETDEL) and the day's unique viewer count (PFCOUNT, the
 * HyperLogLog stays until it expires), then add the views to the row and keep the larger unique
 * count. When the database write fails, the taken views are put back and the chapters marked
 * dirty again before throwing, so nothing is lost or counted twice; when Redis fails mid-batch the
 * chapters are marked again (views already taken in that batch are lost, which is accepted).
 * Chapters deleted since are skipped.
 */
export async function flushViewCounters(
  redis: Redis,
  db: Db,
  prefix: string,
  dates: readonly string[],
): Promise<{ chapters: number }> {
  let flushed = 0;
  for (const date of dates) {
    const keys = viewKeys(prefix, date);
    for (;;) {
      const ids = (await redis.spop(keys.dirty, BATCH)).filter((id) => UUID.test(id));
      if (ids.length === 0) break;
      let batch: Pending[];
      try {
        batch = await takeCounters(redis, keys, ids);
      } catch (error) {
        // Keep the chapters marked so whatever is still counted gets flushed next time.
        await redis.sadd(keys.dirty, ...ids).catch(() => {});
        throw error;
      }
      if (batch.length === 0) continue;
      try {
        await writeStats(db, date, batch);
      } catch (error) {
        await giveBack(redis, keys, batch);
        throw error;
      }
      flushed += batch.length;
    }
  }
  return { chapters: flushed };
}

async function takeCounters(
  redis: Redis,
  keys: ReturnType<typeof viewKeys>,
  ids: readonly string[],
): Promise<Pending[]> {
  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.getdel(keys.views(id));
    pipeline.pfcount(keys.uniqueViewers(id));
  }
  const replies = (await pipeline.exec()) ?? [];
  const batch: Pending[] = [];
  ids.forEach((chapterId, i) => {
    const [viewsErr, views] = replies[i * 2] ?? [];
    const [uvErr, uv] = replies[i * 2 + 1] ?? [];
    const failure = viewsErr ?? uvErr;
    if (failure) throw failure;
    batch.push({ chapterId, views: Number(views ?? 0), uniqueReaders: Number(uv ?? 0) });
  });
  return batch;
}

async function writeStats(db: Db, date: string, batch: readonly Pending[]): Promise<void> {
  const rows: SQL[] = batch.map(
    (p) => sql`(${p.chapterId}::uuid, ${date}::date, ${p.views}::int, ${p.uniqueReaders}::int)`,
  );
  await db.execute(sql`
    insert into chapter_daily_stats (chapter_id, date, views, unique_readers)
    select v.chapter_id, v.date, v.views, v.unique_readers
    from (values ${sql.join(rows, sql`, `)}) as v(chapter_id, date, views, unique_readers)
    join chapters c on c.id = v.chapter_id
    on conflict (chapter_id, date) do update set
      views = chapter_daily_stats.views + excluded.views,
      unique_readers = greatest(chapter_daily_stats.unique_readers, excluded.unique_readers)
  `);
}

async function giveBack(
  redis: Redis,
  keys: ReturnType<typeof viewKeys>,
  batch: readonly Pending[],
): Promise<void> {
  const pipeline = redis.pipeline();
  for (const p of batch) {
    if (p.views === 0) continue;
    pipeline.incrby(keys.views(p.chapterId), p.views);
    pipeline.expire(keys.views(p.chapterId), VIEW_RULES.keyTtlSec);
  }
  pipeline.sadd(keys.dirty, ...batch.map((p) => p.chapterId));
  pipeline.expire(keys.dirty, VIEW_RULES.keyTtlSec);
  await pipeline.exec();
}
