import {
  chapterDailyStats,
  chapters,
  follows,
  readingProgress,
  storyDailyStats,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { StoryActor } from '../policies/story';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getStoryStats } from './get-story-stats';

const TODAY = '2026-10-06';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** `TODAY` moved back by `days`. */
function daysAgo(days: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** Noon in Vietnam `days` before `TODAY`. */
function noonDaysAgo(days: number): Date {
  return new Date(Date.parse(`${daysAgo(days)}T05:00:00Z`));
}

async function makeReaders(n: number): Promise<string[]> {
  const rows = await db
    .insert(users)
    .values(
      Array.from({ length: n }, (_, i) => ({
        username: `reader_${i}`,
        displayName: `Độc giả ${i}`,
        email: `reader_${i}@example.com`,
        emailVerified: true,
      })),
    )
    .returning({ id: users.id });
  return rows.map((r) => r.id);
}

async function chapterIds(storyId: string): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: chapters.id, number: chapters.number })
    .from(chapters)
    .where(eq(chapters.storyId, storyId));
  return new Map(rows.map((r) => [r.number, r.id]));
}

/** A 3-chapter story with reads, readers, progress and follows inside and outside the window. */
async function storyWithActivity() {
  const author = await makeAuthor(db);
  const story = await makePublishedStory(db, author, 3);
  const ids = await chapterIds(story.storyId);
  const [r1, r2, r3, r4, r5] = await makeReaders(5);
  const id = (n: number) => ids.get(n) as string;

  await db.insert(chapterDailyStats).values([
    { chapterId: id(1), date: daysAgo(0), views: 40 },
    { chapterId: id(1), date: daysAgo(29), views: 10 },
    // The day before the window: left out.
    { chapterId: id(1), date: daysAgo(30), views: 1000 },
    { chapterId: id(2), date: daysAgo(3), views: 20 },
    { chapterId: id(3), date: daysAgo(1), views: 5 },
  ]);
  await db.insert(storyDailyStats).values([
    { storyId: story.storyId, date: daysAgo(0), uniqueReaders: 7 },
    { storyId: story.storyId, date: daysAgo(10), uniqueReaders: 3 },
    { storyId: story.storyId, date: daysAgo(31), uniqueReaders: 500 },
  ]);
  // Latest chapters: 1, 1, 2, 3, 3; the author's own progress on chapter 1 is not counted.
  await db.insert(readingProgress).values([
    { userId: r1 as string, storyId: story.storyId, chapterId: id(1) },
    { userId: r2 as string, storyId: story.storyId, chapterId: id(1) },
    { userId: r3 as string, storyId: story.storyId, chapterId: id(2) },
    { userId: r4 as string, storyId: story.storyId, chapterId: id(3) },
    { userId: r5 as string, storyId: story.storyId, chapterId: id(3) },
    { userId: author.id, storyId: story.storyId, chapterId: id(1) },
  ]);
  await db.insert(follows).values([
    {
      userId: r1 as string,
      targetType: 'story',
      targetId: story.storyId,
      createdAt: noonDaysAgo(2),
    },
    {
      userId: r2 as string,
      targetType: 'story',
      targetId: story.storyId,
      createdAt: noonDaysAgo(29),
    },
    {
      userId: r3 as string,
      targetType: 'story',
      targetId: story.storyId,
      createdAt: noonDaysAgo(40),
    },
    { userId: r1 as string, targetType: 'user', targetId: author.id, createdAt: noonDaysAgo(0) },
    { userId: r4 as string, targetType: 'user', targetId: author.id, createdAt: noonDaysAgo(31) },
  ]);
  return { author, story, readers: [r1, r2, r3, r4, r5] as string[] };
}

describe('getStoryStats (real Postgres)', () => {
  it('sums the last 30 days and computes drop-off from reading progress', async () => {
    const { author, story } = await storyWithActivity();

    const result = await getStoryStats(db, author, story.publicId, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.window).toEqual({ from: daysAgo(29), to: TODAY });
    expect(result.value.story).toEqual({ publicId: story.publicId, title: 'Kiếm Đạo Độc Tôn' });
    expect(result.value.totals).toEqual({
      views: 75,
      readers: 10,
      newStoryFollows: 2,
      newAuthorFollows: 1,
      storyFollowersTotal: 3,
    });
    expect(result.value.chapters).toEqual([
      { number: 1, title: null, views30d: 50, reached: 5, dropOffPct: 40 },
      { number: 2, title: null, views30d: 20, reached: 3, dropOffPct: 33.3 },
      { number: 3, title: null, views30d: 5, reached: 2, dropOffPct: null },
    ]);
  });

  it('lists only published chapters but keeps readers who stopped on a removed one', async () => {
    const { author, story } = await storyWithActivity();
    // A draft chapter 4 is not listed; chapter 2 deleted: its reads stay in the total.
    await addChapter(db, author, story.publicId, true);
    await db
      .update(chapters)
      .set({ deletedAt: new Date() })
      .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, 2)));

    const result = await getStoryStats(db, author, story.publicId, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.totals.views).toBe(75);
    expect(result.value.chapters).toEqual([
      { number: 1, title: null, views30d: 50, reached: 5, dropOffPct: 60 },
      { number: 3, title: null, views30d: 5, reached: 2, dropOffPct: null },
    ]);
  });

  it('returns zeros for a story without activity', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 0);

    const result = await getStoryStats(db, author, story.publicId, TODAY);
    expect(result).toEqual({
      ok: true,
      value: {
        story: { publicId: story.publicId, title: 'Kiếm Đạo Độc Tôn' },
        window: { from: daysAgo(29), to: TODAY },
        totals: {
          views: 0,
          readers: 0,
          newStoryFollows: 0,
          newAuthorFollows: 0,
          storyFollowersTotal: 0,
        },
        chapters: [],
      },
    });
  });

  it('is not found for anyone but the author, and for an unknown story', async () => {
    const { story, readers } = await storyWithActivity();
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, readers[0] as string));
    if (!row) throw new Error('reader missing');
    const other: StoryActor = {
      id: row.id,
      role: 'admin',
      status: row.status,
      emailVerified: true,
    };

    expect(await getStoryStats(db, other, story.publicId, TODAY)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const author = await makeAuthor(db, 'author_two');
    expect(await getStoryStats(db, author, 'zzzzzzzz', TODAY)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await getStoryStats(db, author, 'not-an-id', TODAY)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });
});
