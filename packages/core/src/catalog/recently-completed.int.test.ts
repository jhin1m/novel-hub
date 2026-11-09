import { stories } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { HOME_COMPLETED_LIMIT, HOME_DEDUPE_SLACK } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getHomePage } from './home-page';
import { listStories } from './lists';
import { listRecentlyCompleted } from './recently-completed';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/** Counters of a completed story just past the home listing threshold (3 chapters, 5,000 words). */
const LISTED = { status: 'completed', chapterCount: 3, wordCount: 5_000 } as const;

async function setStory(storyId: string, values: Partial<typeof stories.$inferInsert>) {
  await db.update(stories).set(values).where(eq(stories.id, storyId));
}

describe('listRecentlyCompleted', () => {
  it('lists completed public stories past the threshold, most recently updated first', async () => {
    const author = await makeAuthor(db);
    const older = await makePublishedStory(db, author, 1, 'Xong Trước');
    const newer = await makePublishedStory(db, author, 1, 'Xong Sau');
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám');
    const ongoing = await makePublishedStory(db, author, 1, 'Đang Ra');
    const short = await makePublishedStory(db, author, 1, 'Quá Ngắn');
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await setStory(older.storyId, { ...LISTED, lastChapterAt: daysAgo(3) });
    await setStory(newer.storyId, { ...LISTED, lastChapterAt: daysAgo(1) });
    await setStory(mature.storyId, { ...LISTED, lastChapterAt: daysAgo(2), isMature: true });
    await setStory(ongoing.storyId, { ...LISTED, status: 'ongoing', lastChapterAt: daysAgo(1) });
    await setStory(short.storyId, { ...LISTED, wordCount: 4_999, lastChapterAt: daysAgo(1) });
    await setStory(hidden.storyId, { ...LISTED, visibility: 'hidden_by_mod' });

    const guest = await listRecentlyCompleted(db, { includeMature: false });
    expect(guest.map((s) => s.title)).toEqual(['Xong Sau', 'Xong Trước']);
    expect(guest.every((s) => s.status === 'completed')).toBe(true);
    const adult = await listRecentlyCompleted(db, { includeMature: true });
    expect(adult.map((s) => s.title)).toEqual(['Xong Sau', 'Mười Tám', 'Xong Trước']);

    expect((await getHomePage(db, NOW)).completed.map((s) => s.title)).toEqual([
      'Xong Sau',
      'Xong Trước',
    ]);
    const api = await listStories(db, { list: 'completed' }, { includeMature: true });
    expect(api).toEqual({ stories: adult, page: 1, totalPages: 1 });
  });

  it('loads extra stories for the home page, which drops those shown higher up', async () => {
    const author = await makeAuthor(db);
    const extra = HOME_COMPLETED_LIMIT + HOME_DEDUPE_SLACK;
    for (let i = 0; i <= extra; i++) {
      const s = await makePublishedStory(db, author, 0, `Truyện ${i}`);
      await setStory(s.storyId, { ...LISTED, visibility: 'published', lastChapterAt: daysAgo(1) });
    }
    expect((await getHomePage(db, NOW)).completed).toHaveLength(extra);
    const api = await listStories(db, { list: 'completed' }, { includeMature: false });
    expect(api?.stories).toHaveLength(extra);
  });
});
