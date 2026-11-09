import { stories } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { EXPLORE_ENTRY_SIZE } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { RankingReader } from '../rankings/ranking-reader';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getExploreEntry } from './explore-entry';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  writer = undefined;
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/** Counters past the home listing threshold, new enough for the spotlight. */
const LISTED = { chapterCount: 3, wordCount: 5_000, lastChapterAt: daysAgo(1) } as const;

async function story(title: string, values: Partial<typeof stories.$inferInsert> = {}) {
  const s = await makePublishedStory(db, await author(), 1, title);
  await db
    .update(stories)
    .set({ ...LISTED, createdAt: daysAgo(2), ...values })
    .where(eq(stories.id, s.storyId));
  return s.storyId;
}

let writer: Awaited<ReturnType<typeof makeAuthor>> | undefined;
const author = async () => (writer ??= await makeAuthor(db));

/** A reader that serves `ids` as every ranking, recording the variant and count asked for. */
function stubReader(ids: string[], asked: [string, number][] = []): RankingReader {
  return {
    top: (_period, variant, limit) => {
      asked.push([variant, limit]);
      return Promise.resolve(ids.slice(0, limit));
    },
  };
}

const titles = (list: { title: string }[]) => list.map((s) => s.title);

describe('getExploreEntry', () => {
  it('reads the weekly ranking, recently completed and the spotlight, never 18+', async () => {
    const ranked = await story('Đọc Nhiều');
    const mature = await story('Người Lớn', { isMature: true, status: 'completed' });
    await story('Đã Xong', { status: 'completed' });
    const asked: [string, number][] = [];

    const entry = await getExploreEntry(db, stubReader([mature, ranked], asked), NOW);
    expect(entry.ranking).toEqual({ available: true, stories: [expect.anything()] });
    expect(titles(entry.ranking.stories)).toEqual(['Đọc Nhiều']);
    expect(asked).toEqual([['general', 25]]);
    expect(titles(entry.completed)).toEqual(['Đã Xong']);
    expect(titles(entry.spotlight).sort()).toEqual(['Đã Xong', 'Đọc Nhiều']);
  });

  it('marks the ranking unavailable without Redis and keeps the other rows', async () => {
    await story('Đã Xong', { status: 'completed' });
    const entry = await getExploreEntry(db, null, NOW);
    expect(entry.ranking).toEqual({ available: false, stories: [] });
    expect(titles(entry.completed)).toEqual(['Đã Xong']);
  });

  it('keeps each row to the entry size', async () => {
    const ids: string[] = [];
    for (let i = 0; i < EXPLORE_ENTRY_SIZE + 2; i++) {
      ids.push(await story(`Truyện ${i}`, { status: 'completed' }));
    }
    const entry = await getExploreEntry(db, stubReader(ids), NOW);
    expect(entry.ranking.stories).toHaveLength(EXPLORE_ENTRY_SIZE);
    expect(entry.completed).toHaveLength(EXPLORE_ENTRY_SIZE);
    expect(entry.spotlight).toHaveLength(EXPLORE_ENTRY_SIZE);
  });
});
