import { stories, storyDailyStats, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { computeRankings } from './compute-rankings';
import { createRankingReader, readRanking } from './ranking-reader';
import { rankingKey } from './ranking-keys';
import { recomputeAllRankings } from './recompute-rankings';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
const PREFIX = `test-rankings-${Date.now().toString(36)}`;
const TODAY = '2026-10-06';
// 05:00 UTC is noon in Vietnam: `statsDate(NOW)` is TODAY.
const NOW = new Date('2026-10-06T05:00:00Z');

const { db, pool } = createTestDb();
const redis = new Redis(TEST_REDIS_URL);
const reader = createRankingReader(redis, PREFIX, 500);

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

/** `date` moved back by `days`. */
function daysAgo(days: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** Daily readers of a story: `readers[i]` is the count `i` days ago. */
async function stats(storyId: string, readers: Record<number, number>): Promise<void> {
  await db.insert(storyDailyStats).values(
    Object.entries(readers).map(([ago, uniqueReaders]) => ({
      storyId,
      date: daysAgo(Number(ago)),
      uniqueReaders,
    })),
  );
}

async function threeStories() {
  const author = await makeAuthor(db);
  const a = await makePublishedStory(db, author, 1, 'Truyện A');
  const b = await makePublishedStory(db, author, 1, 'Truyện B');
  const c = await makePublishedStory(db, author, 1, 'Truyện C');
  return { author, a, b, c };
}

const titles = (list: { title: string }[]) => list.map((s) => s.title);

describe('rankings (real Redis and Postgres)', () => {
  it('orders stories by readers summed over each window', async () => {
    const { a, b, c } = await threeStories();
    // A: many readers 10 days ago, B: steady this week, C: only today.
    await stats(a.storyId, { 10: 500, 1: 5 });
    await stats(b.storyId, { 0: 10, 2: 30, 5: 30 });
    await stats(c.storyId, { 0: 40 });

    expect(await computeRankings(db, 'day', TODAY, { includeMature: false })).toEqual([
      c.storyId,
      b.storyId,
      a.storyId,
    ]);
    expect(await computeRankings(db, 'week', TODAY, { includeMature: false })).toEqual([
      b.storyId,
      c.storyId,
      a.storyId,
    ]);
    expect(await computeRankings(db, 'month', TODAY, { includeMature: false })).toEqual([
      a.storyId,
      b.storyId,
      c.storyId,
    ]);
  });

  it('rising keeps stories with enough readers that grew, by relative growth', async () => {
    const { a, b, c } = await threeStories();
    await stats(a.storyId, { 1: 40, 8: 20 }); // +100%
    await stats(b.storyId, { 1: 19, 8: 1 }); // under 20 readers this week
    await stats(c.storyId, { 1: 30, 8: 40 }); // shrinking
    const author2 = await makeAuthor(db, 'second');
    const d = await makePublishedStory(db, author2, 1, 'Truyện D');
    await stats(d.storyId, { 0: 25 }); // new: (25 − 0) / 20
    expect(await computeRankings(db, 'rising', TODAY, { includeMature: false })).toEqual([
      d.storyId,
      a.storyId,
    ]);
  });

  it('writes both variants, keeps 18+ stories out of the general one, and reads them back as cards', async () => {
    const { a, b } = await threeStories();
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, b.storyId));
    await stats(a.storyId, { 0: 5 });
    await stats(b.storyId, { 0: 9 });

    expect(await recomputeAllRankings(db, redis, PREFIX, NOW)).toEqual({
      rankings: 8,
      // day, week, month: 1 general + 2 all each; rising: none (under 20 readers).
      entries: 9,
    });
    expect(await redis.exists(rankingKey(PREFIX, 'rising', 'all'))).toBe(0);

    const general = await readRanking(db, reader, 'week', { includeMature: false });
    expect(general.available).toBe(true);
    expect(titles(general.stories)).toEqual(['Truyện A']);
    const all = await readRanking(db, reader, 'week', { includeMature: true });
    expect(titles(all.stories)).toEqual(['Truyện B', 'Truyện A']);
  });

  it('drops a story hidden or banned since the recompute, without waiting for the next one', async () => {
    const { author, a, b } = await threeStories();
    await stats(a.storyId, { 0: 5 });
    await stats(b.storyId, { 0: 9 });
    await recomputeAllRankings(db, redis, PREFIX, NOW);

    await db.update(stories).set({ visibility: 'hidden_by_mod' }).where(eq(stories.id, b.storyId));
    expect(
      titles((await readRanking(db, reader, 'day', { includeMature: false })).stories),
    ).toEqual(['Truyện A']);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect((await readRanking(db, reader, 'day', { includeMature: false })).stories).toEqual([]);
    // And the next recompute leaves them out too.
    await recomputeAllRankings(db, redis, PREFIX, NOW);
    expect(await redis.exists(rankingKey(PREFIX, 'day', 'general'))).toBe(0);
  });

  it('an empty recompute deletes the old ranking instead of keeping it', async () => {
    const { a } = await threeStories();
    await stats(a.storyId, { 0: 5 });
    await recomputeAllRankings(db, redis, PREFIX, NOW);
    expect(await redis.zcard(rankingKey(PREFIX, 'day', 'general'))).toBe(1);
    // A week later the readers left the day window.
    await recomputeAllRankings(db, redis, PREFIX, new Date(NOW.getTime() + 7 * 86_400_000));
    expect(await redis.exists(rankingKey(PREFIX, 'day', 'general'))).toBe(0);
    expect(await redis.zcard(rankingKey(PREFIX, 'month', 'general'))).toBe(1);
    expect(await redis.keys(`${PREFIX}:*:tmp`)).toEqual([]);
  });

  it('reads as unavailable, never throwing, when Redis fails or hangs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      zrange: () => Promise.reject(new Error('redis down')),
    } as unknown as Redis;
    const hanging = { zrange: () => new Promise(() => {}) } as unknown as Redis;
    for (const store of [broken, hanging]) {
      const page = await readRanking(db, createRankingReader(store, PREFIX, 50), 'week', {
        includeMature: false,
      });
      expect(page).toEqual({ stories: [], available: false });
    }
    expect(await readRanking(db, null, 'week', { includeMature: false })).toEqual({
      stories: [],
      available: false,
    });
    // An empty ranking that could be read is a fact, not an outage.
    expect(await readRanking(db, reader, 'week', { includeMature: false })).toEqual({
      stories: [],
      available: true,
    });
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
