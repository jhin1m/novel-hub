import { stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { HOME_RANKING_SCAN, HOME_RANKING_SIZE, RANKING_PERIODS } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { readHomeRankings } from './home-rankings';
import type { RankingReader } from './ranking-reader';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** A reader that ranks the same ids for every period and records what it was asked for. */
function fixedReader(ids: string[]) {
  const calls: { period: string; variant: string; limit: number }[] = [];
  const reader: RankingReader = {
    top(period, variant, limit) {
      calls.push({ period, variant, limit });
      return Promise.resolve(ids.slice(0, limit));
    },
  };
  return { reader, calls };
}

const titles = (list: { title: string }[]) => list.map((s) => s.title);

describe('readHomeRankings (real Postgres, stubbed rankings)', () => {
  it('reads every period, general variant only, a few ids each, and cuts to the section size', async () => {
    const author = await makeAuthor(db);
    const made = [];
    for (let i = 1; i <= 7; i++) made.push(await makePublishedStory(db, author, 1, `Truyện ${i}`));
    const { reader, calls } = fixedReader(made.map((s) => s.storyId));

    const home = await readHomeRankings(db, reader);
    expect(home.available).toBe(true);
    for (const period of RANKING_PERIODS) {
      expect(titles(home.periods[period])).toEqual(
        made.slice(0, HOME_RANKING_SIZE).map((_, n) => `Truyện ${n + 1}`),
      );
    }
    expect(calls.map((c) => c.period).sort()).toEqual([...RANKING_PERIODS].sort());
    expect(calls.every((c) => c.variant === 'general' && c.limit === HOME_RANKING_SCAN)).toBe(true);
  });

  it('leaves out 18+ stories, stories hidden by a moderator and stories of banned authors', async () => {
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_one');
    const mature = await makePublishedStory(db, author, 1, 'Người Lớn', { isMature: true });
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    const ofBanned = await makePublishedStory(db, banned, 1, 'Của Người Bị Cấm');
    const kept = await makePublishedStory(db, author, 1, 'Còn Lại');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));
    const { reader } = fixedReader([mature, hidden, ofBanned, kept].map((s) => s.storyId));

    const home = await readHomeRankings(db, reader);
    expect(titles(home.periods.week)).toEqual(['Còn Lại']);
  });

  it('is unavailable, with every period empty, when the rankings cannot be read', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1, 'Một Truyện');
    const empty = { day: [], week: [], month: [], rising: [] };
    expect(await readHomeRankings(db, null)).toEqual({ available: false, periods: empty });

    // One period failing alone hides the whole section too.
    const flaky: RankingReader = {
      top: (period) => Promise.resolve(period === 'month' ? null : [story.storyId]),
    };
    expect(await readHomeRankings(db, flaky)).toEqual({ available: false, periods: empty });
  });
});
