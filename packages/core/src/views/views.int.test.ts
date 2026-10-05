import { chapterDailyStats, chapters } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { flushViewCounters } from './flush';
import { recordChapterView } from './record-chapter-view';
import { createViewCounter } from './view-counter';
import { viewKeys } from './view-keys';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
const PREFIX = `test-views-${Date.now().toString(36)}`;
const DATE = '2026-10-05';
const NOW = new Date('2026-10-05T05:00:00Z');

const { db, pool } = createTestDb();
const redis = new Redis(TEST_REDIS_URL);
const viewCounter = createViewCounter(redis, PREFIX);

async function clearPrefix(): Promise<void> {
  const keys = await redis.keys(`${PREFIX}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

afterAll(async () => {
  await clearPrefix();
  redis.disconnect();
  await pool.end();
});

beforeEach(async () => {
  await clearPrefix();
  await truncateAll(db);
  await seedTags(db);
});

async function chapterId(storyId: string, number: number): Promise<string> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
  if (!row) throw new Error('chapter missing');
  return row.id;
}

const view = (publicId: string, viewer: string, ip: string | null = '203.0.113.1') =>
  recordChapterView({ db, viewCounter }, { publicId, number: 1, viewer, ip, now: NOW });

describe('view counting (real Redis and Postgres)', () => {
  it('caps reads per viewer and per IP, then flushes them once', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    const id = await chapterId(s.storyId, 1);

    const counted: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await view(s.publicId, 'u:same');
      if (result.ok) counted.push(result.value.counted);
    }
    expect(counted).toEqual([true, true, true, false, false]);

    // Eleven anonymous viewers behind one IP: the IP already has 3 reads, so 7 more count.
    let fromIp = 0;
    for (let i = 0; i < 11; i++) {
      const result = await view(s.publicId, `a:${i}`);
      if (result.ok && result.value.counted) fromIp++;
    }
    expect(fromIp).toBe(7);
    // Past the IP cap, fresh viewer ids (a client dropping its cookie) create no keys.
    const keysAtCap = (await redis.keys(`${PREFIX}:*`)).length;
    for (let i = 0; i < 20; i++) await view(s.publicId, `a:fresh-${i}`);
    expect(await redis.keys(`${PREFIX}:*`)).toHaveLength(keysAtCap);
    // No IP known: only the per-viewer cap applies.
    expect(await view(s.publicId, 'a:no-ip', null)).toEqual({ ok: true, value: { counted: true } });

    expect(await flushViewCounters(redis, db, PREFIX, [DATE])).toEqual({ chapters: 1 });
    const [row] = await db.select().from(chapterDailyStats);
    expect(row).toMatchObject({ chapterId: id, date: DATE, views: 11, completions: 0 });
    // HyperLogLog: 1 + 7 + 1 distinct viewers were counted (approximate, exact at this size).
    expect(row?.uniqueReaders).toBe(9);

    // Nothing left to flush: running again adds nothing.
    expect(await flushViewCounters(redis, db, PREFIX, [DATE])).toEqual({ chapters: 0 });
    // A new read adds to the row; the unique count never goes down.
    expect(await view(s.publicId, 'a:late', '198.51.100.7')).toMatchObject({ ok: true });
    await flushViewCounters(redis, db, PREFIX, [DATE]);
    const [after] = await db.select().from(chapterDailyStats);
    expect(after).toMatchObject({ views: 12, uniqueReaders: 10 });
  });

  it('gives the counters back when the database write fails, and flushes them next time', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await view(s.publicId, 'u:1');
    await view(s.publicId, 'u:2');

    const failing = {
      execute: () => Promise.reject(new Error('db down')),
    } as unknown as typeof db;
    await expect(flushViewCounters(redis, failing, PREFIX, [DATE])).rejects.toThrow('db down');
    const keys = viewKeys(PREFIX, DATE);
    expect(await redis.scard(keys.dirty)).toBe(1);

    expect(await flushViewCounters(redis, db, PREFIX, [DATE])).toEqual({ chapters: 1 });
    const [row] = await db.select().from(chapterDailyStats);
    expect(row).toMatchObject({ views: 2, uniqueReaders: 2 });
  });

  it('never counts an unreadable chapter, and a dead counter does not fail the read', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    expect(
      await recordChapterView(
        { db, viewCounter },
        { publicId: s.publicId, number: 2, viewer: 'u:1', ip: null, now: NOW },
      ),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await redis.keys(`${PREFIX}:*`)).toEqual([]);

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { record: () => Promise.reject(new Error('redis down')) };
    expect(
      await recordChapterView(
        { db, viewCounter: broken },
        { publicId: s.publicId, number: 1, viewer: 'u:1', ip: null, now: NOW },
      ),
    ).toEqual({ ok: true, value: { counted: false } });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('skips counters of chapters that no longer exist', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await view(s.publicId, 'u:1');
    await db.delete(chapters).where(eq(chapters.storyId, s.storyId));
    expect(await flushViewCounters(redis, db, PREFIX, [DATE])).toEqual({ chapters: 1 });
    expect(await db.select().from(chapterDailyStats)).toEqual([]);
  });
});
